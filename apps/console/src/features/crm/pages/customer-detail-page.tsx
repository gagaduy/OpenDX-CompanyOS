// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Calendar,
  CreditCard,
  Crown,
  Mail,
  Package,
  Phone,
  Receipt,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import { formatVnd } from "../../../shared/format/currency";
import type { CrmOperationsApi } from "../api/crm-api";
import { CustomerSummary } from "../components/customer-summary";
import { CustomerTimeline } from "../components/customer-timeline";
import { FollowupPanel } from "../components/followup-panel";
import { useCustomer360 } from "../hooks/use-customer-360";
import type { FollowupView } from "../types/crm.types";
import "../../customers/styles/customers.css";

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #3b82f6, #06b6d4)",
  "linear-gradient(135deg, #10b981, #059669)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #ec4899, #8b5cf6)",
  "linear-gradient(135deg, #0ea5e9, #6366f1)",
];

function getAvatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

function getInitials(fullName?: string, email?: string): string {
  if (fullName && fullName.trim().length > 0) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "KH";
}

export function CustomerDetailPage({
  api,
}: {
  readonly api: CrmOperationsApi;
}) {
  const { customerId } = useParams();
  const { data, error, loading, reload, replace } = useCustomer360(
    api,
    customerId,
  );
  const [mutationError, setMutationError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [lastClaim, setLastClaim] = useState<FollowupView>();

  const claim = async (followup: FollowupView) => {
    if (!customerId) return;
    setPending(followup.id);
    setMutationError(undefined);
    setStatus(undefined);
    setLastClaim(followup);
    try {
      const updated = await api.updateFollowup(customerId, followup.id, {
        action: "claim",
        version: followup.version,
      });
      if (data) {
        replace({
          ...data,
          followups: data.followups.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        });
      }
      setStatus("Follow-up claimed");
    } catch (reason) {
      setMutationError(
        reason instanceof Error
          ? reason.message
          : "Follow-up could not be updated.",
      );
    } finally {
      setPending(undefined);
    }
  };

  const retry = () => {
    if (lastClaim) void claim(lastClaim);
  };

  if (loading && !data) {
    return <SystemState kind="loading" title="Loading customer…" />;
  }

  if (error) {
    return (
      <SystemState
        kind="error"
        title={error}
        action={
          <button className="secondaryButton" type="button" onClick={reload}>
            Retry
          </button>
        }
      />
    );
  }

  if (!data) return null;

  const customer = data.customer;
  const initials = getInitials(customer.fullName, customer.email);
  const avatarGradient = getAvatarGradient(customer.email || customer.id);
  const aov =
    data.paidFacts.paidOrderCount > 0
      ? Math.round(
          data.paidFacts.lifetimePaidVnd / data.paidFacts.paidOrderCount,
        )
      : 0;

  return (
    <section className="catalogWorkspace operationsWorkspace customerWorkspace">
      <PageHeader
        eyebrow="Customer 360"
        title={customer.fullName ?? customer.email}
        description={customer.id}
        breadcrumb={[
          { label: "Customers", to: "/customers" },
          { label: "Customer 360" },
        ]}
      />

      {/* Financial & Order Highlights Grid */}
      <div className="customer360FinancialGrid">
        <div className="customer360StatCard">
          <span className="customer360StatLabel">
            <TrendingUp size={15} style={{ color: "#34d399" }} aria-hidden="true" />
            <span>Doanh Thu Trọn Đời (LTV)</span>
          </span>
          <span className="customer360StatValue">
            {formatVnd(data.paidFacts.lifetimePaidVnd)}
          </span>
          <span className="customer360StatSub">Tổng chi tiêu thực tế đã thanh toán</span>
        </div>

        <div className="customer360StatCard">
          <span className="customer360StatLabel">
            <ShoppingBag size={15} style={{ color: "#38bdf8" }} aria-hidden="true" />
            <span>Đơn Hàng Đã Mua</span>
          </span>
          <span className="customer360StatValue">
            {data.paidFacts.paidOrderCount} đơn
          </span>
          <span className="customer360StatSub">Giao dịch thanh toán thành công</span>
        </div>

        <div className="customer360StatCard">
          <span className="customer360StatLabel">
            <Receipt size={15} style={{ color: "#a855f7" }} aria-hidden="true" />
            <span>Giá Trị Trung Bình (AOV)</span>
          </span>
          <span className="customer360StatValue">{formatVnd(aov)}</span>
          <span className="customer360StatSub">Trung bình trên mỗi đơn hàng</span>
        </div>

        <div className="customer360StatCard">
          <span className="customer360StatLabel">
            <Calendar size={15} style={{ color: "#f59e0b" }} aria-hidden="true" />
            <span>Đơn Mới Nhất</span>
          </span>
          <span className="customer360StatValue" style={{ fontSize: "1.15rem", marginTop: 4 }}>
            {data.paidFacts.latestPaidAt
              ? new Date(data.paidFacts.latestPaidAt).toLocaleDateString("vi-VN")
              : "Chưa có"}
          </span>
          <span className="customer360StatSub">Thời điểm thanh toán gần nhất</span>
        </div>
      </div>

      {/* Action Messages */}
      {mutationError ? (
        <div className="pageState" role="alert">
          <p>{mutationError}</p>
          <button className="secondaryButton" type="button" onClick={retry}>
            Retry claim
          </button>
        </div>
      ) : null}

      {status ? (
        <div className="pageState" role="status">
          {status}
        </div>
      ) : null}

      {/* Main Detail Grid */}
      <div className="detailGrid customer360DetailGrid">
        <CustomerSummary view={data} />
        <FollowupPanel
          followups={data.followups}
          onClaim={claim}
          pending={pending}
        />
        <CustomerTimeline view={data} />

        {/* Order History Section */}
        {data.orders.length > 0 ? (
          <section className="detailCard customer360SectionCard" aria-label="Customer Orders">
            <div className="customer360SectionHeader">
              <h2 className="customer360SectionTitle">
                <Package size={18} style={{ color: "#10b981" }} aria-hidden="true" />
                <span>Lịch Sử Đơn Hàng ({data.orders.length})</span>
              </h2>
            </div>

            <div className="customerOrderList">
              {data.orders.map((order) => {
                const isPaid = order.status === "paid" || order.status === "completed";

                return (
                  <div key={order.id} className="customerOrderItem">
                    <div className="customerOrderLeft">
                      <span className="customerOrderNumber">#{order.publicNumber}</span>
                      <span className="customerOrderDate">
                        {new Date(order.createdAt).toLocaleString("vi-VN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="customerOrderRight">
                      <span className="customerOrderAmount">
                        {formatVnd(order.totalVnd)}
                      </span>
                      <span
                        className={`customerOrderStatusChip ${isPaid ? "paid" : "pending_payment"}`}
                      >
                        {order.status === "paid"
                          ? "Đã thanh toán"
                          : order.status === "completed"
                          ? "Hoàn thành"
                          : order.status === "pending_payment"
                          ? "Chờ thanh toán"
                          : order.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
