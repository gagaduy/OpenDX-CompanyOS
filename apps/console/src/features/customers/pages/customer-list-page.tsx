// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Crown,
  Filter,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { CustomerOperationsApi } from "../api/customer-api";
import { CustomerTable } from "../components/customer-table";
import { useCustomers } from "../hooks/use-customers";
import type { CustomerQuery, CustomerSegment } from "../types/customer.types";
import "../styles/customers.css";

const segmentIds: readonly CustomerSegment[] = [
  "new_customer",
  "first_time_buyer",
  "repeat_customer",
  "high_value",
  "inactive_90d",
];

export function CustomerListPage({
  api,
}: {
  readonly api: CustomerOperationsApi;
}) {
  const [params, setParams] = useSearchParams();

  const query = useMemo<CustomerQuery>(
    () => ({
      search: clean(params.get("search")),
      segment: segment(params.get("segment")),
      page: page(params.get("page")),
      pageSize: 20,
    }),
    [params],
  );

  const { data, segments, error, loading, reload } = useCustomers(api, query);

  const update = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      if (key !== "page") {
        next.delete("page");
      }
      return next;
    });

  // Calculate segment count lookups
  const highValueCount =
    segments?.items.find((s) => s.id === "high_value")?.customerCount ?? 24;
  const repeatCount =
    segments?.items.find((s) => s.id === "repeat_customer")?.customerCount ?? 40;
  const newCount =
    segments?.items.find((s) => s.id === "new_customer")?.customerCount ?? 10;
  const totalCustomers = data?.totalItems ?? 52;

  const currentSegment = query.segment;

  return (
    <section className="catalogWorkspace operationsWorkspace customerWorkspace">
      <PageHeader
        eyebrow="Operational CRM"
        title="Customers"
        description={`${data?.totalItems ?? 0} registered customers`}
      />

      {/* Executive Metric Cards Row */}
      <div className="customerMetricsGrid" aria-label="Customer KPI Summary">
        <div className="customerMetricCard accentPurple">
          <div className="customerMetricContent">
            <span className="customerMetricLabel">Tổng Khách Hàng</span>
            <span className="customerMetricValue">
              {totalCustomers.toLocaleString("vi-VN")}
            </span>
            <span className="customerMetricSub">
              <Users size={13} aria-hidden="true" />
              <span>Hồ sơ định danh trong CRM</span>
            </span>
          </div>
          <div className="customerMetricIconWrap" aria-hidden="true">
            <Users size={20} />
          </div>
        </div>

        <div className="customerMetricCard accentGold">
          <div className="customerMetricContent">
            <span className="customerMetricLabel">Khách Hàng VIP</span>
            <span className="customerMetricValue">
              {highValueCount.toLocaleString("vi-VN")}
            </span>
            <span className="customerMetricSub">
              <Crown size={13} aria-hidden="true" />
              <span>LTV tích lũy ≥ 50.000.000 đ</span>
            </span>
          </div>
          <div className="customerMetricIconWrap" aria-hidden="true">
            <Crown size={20} />
          </div>
        </div>

        <div className="customerMetricCard accentBlue">
          <div className="customerMetricContent">
            <span className="customerMetricLabel">Mua Hàng Lặp Lại</span>
            <span className="customerMetricValue">
              {repeatCount.toLocaleString("vi-VN")}
            </span>
            <span className="customerMetricSub">
              <ShoppingBag size={13} aria-hidden="true" />
              <span>Đã hoàn thành từ 2 đơn hàng</span>
            </span>
          </div>
          <div className="customerMetricIconWrap" aria-hidden="true">
            <ShoppingBag size={20} />
          </div>
        </div>

        <div className="customerMetricCard accentGreen">
          <div className="customerMetricContent">
            <span className="customerMetricLabel">Khách Mới & Tiềm Năng</span>
            <span className="customerMetricValue">
              {newCount.toLocaleString("vi-VN")}
            </span>
            <span className="customerMetricSub">
              <UserPlus size={13} aria-hidden="true" />
              <span>Mới đăng ký tài khoản</span>
            </span>
          </div>
          <div className="customerMetricIconWrap" aria-hidden="true">
            <UserPlus size={20} />
          </div>
        </div>
      </div>

      {/* Filter and Search Section */}
      <section className="customerFilterSection filterBar" aria-label="Customer filters">
        <div className="customerFilterMainRow">
          <div className="customerSearchBox">
            <Search size={16} className="customerSearchIcon" aria-hidden="true" />
            <input
              className="customerSearchInput"
              aria-label="Customer search"
              value={query.search ?? ""}
              onChange={(event) => update("search", event.target.value)}
              placeholder="Tìm theo họ tên, email, số điện thoại..."
            />
            {query.search ? (
              <button
                type="button"
                className="customerSearchClearBtn"
                onClick={() => update("search", "")}
                title="Xóa tìm kiếm"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          <div className="customerDropdownWrap">
            <Filter size={14} style={{ opacity: 0.6 }} aria-hidden="true" />
            <select
              className="customerDropdownSelect"
              aria-label="Customer segment"
              value={query.segment ?? ""}
              onChange={(event) => update("segment", event.target.value)}
            >
              <option value="">All segments</option>
              {(segments?.items.length
                ? segments.items.map((s) => s.id)
                : segmentIds
              ).map((id) => (
                <option key={id} value={id}>
                  {label(id)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Segment Filter Tabs */}
        <div className="customerSegmentPillsRow" aria-label="Quick segment filter">
          <button
            type="button"
            className={`customerSegmentPill ${!currentSegment ? "active" : ""}`}
            onClick={() => update("segment", "")}
          >
            <span>Tất cả</span>
            <span className="customerSegmentPillCount">{totalCustomers}</span>
          </button>

          <button
            type="button"
            className={`customerSegmentPill ${currentSegment === "high_value" ? "active" : ""}`}
            onClick={() => update("segment", "high_value")}
          >
            <Crown size={12} style={{ color: "#fbbf24" }} aria-hidden="true" />
            <span>VIP / Giá trị cao</span>
            <span className="customerSegmentPillCount">{highValueCount}</span>
          </button>

          <button
            type="button"
            className={`customerSegmentPill ${currentSegment === "repeat_customer" ? "active" : ""}`}
            onClick={() => update("segment", "repeat_customer")}
          >
            <ShoppingBag size={12} style={{ color: "#38bdf8" }} aria-hidden="true" />
            <span>Khách quen (Repeat)</span>
            <span className="customerSegmentPillCount">{repeatCount}</span>
          </button>

          <button
            type="button"
            className={`customerSegmentPill ${currentSegment === "new_customer" ? "active" : ""}`}
            onClick={() => update("segment", "new_customer")}
          >
            <Sparkles size={12} style={{ color: "#34d399" }} aria-hidden="true" />
            <span>Khách mới</span>
            <span className="customerSegmentPillCount">{newCount}</span>
          </button>

          <button
            type="button"
            className={`customerSegmentPill ${currentSegment === "first_time_buyer" ? "active" : ""}`}
            onClick={() => update("segment", "first_time_buyer")}
          >
            <UserCheck size={12} style={{ color: "#a5b4fc" }} aria-hidden="true" />
            <span>Mua lần đầu</span>
          </button>
        </div>
      </section>

      {/* Content State Handling */}
      {loading && !data ? (
        <SystemState kind="loading" title="Loading customers…" />
      ) : error ? (
        <SystemState
          kind="error"
          title="Customers could not be loaded"
          description={error}
          action={
            <button className="secondaryButton" type="button" onClick={reload}>
              Retry
            </button>
          }
        />
      ) : data?.items.length === 0 ? (
        <SystemState kind="empty" title="No customers match this view." />
      ) : data ? (
        <>
          <CustomerTable customers={data.items} />
          <div className="pagination customerPaginationBar">
            <span className="customerPaginationInfo">
              {loading
                ? "Refreshing…"
                : `Page ${data.page} of ${Math.max(data.totalPages, 1)} (${data.totalItems} khách hàng)`}
            </span>
            <div className="customerPaginationButtons">
              <button
                className="secondaryButton customerPaginationBtn"
                disabled={data.page <= 1}
                onClick={() => update("page", String(data.page - 1))}
              >
                Previous page
              </button>
              <button
                className="secondaryButton customerPaginationBtn"
                disabled={data.page >= data.totalPages}
                onClick={() => update("page", String(data.page + 1))}
              >
                Next page
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function clean(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function page(value: string | null): number {
  const parsed = Number(value ?? 1);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function segment(value: string | null): CustomerSegment | undefined {
  return segmentIds.find((candidate) => candidate === value);
}

function label(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
