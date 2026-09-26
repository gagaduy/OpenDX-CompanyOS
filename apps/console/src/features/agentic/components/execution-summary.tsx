// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

interface ExecutionSummaryProps {
  readonly state: string;
  readonly reservedMicros: number;
  readonly settledMicros: number;
  readonly refreshedAt: string;
  readonly participatingDepartments: number;
  readonly pendingApprovals: number;
}

export function ExecutionSummary({
  state,
  reservedMicros,
  settledMicros,
  refreshedAt,
  participatingDepartments,
  pendingApprovals,
}: ExecutionSummaryProps) {
  return (
    <section className="agenticExecutionSummary" aria-label="Tổng quan tác vụ AI">
      <div className="agenticSummaryHeading">
        <div>
          <span className="agenticDetailEyebrow">Trạng thái vận hành</span>
          <h2>Tổng quan thực thi</h2>
        </div>
        <span className={`agenticStateBadge state-${state}`}>{label(state)}</span>
      </div>
      <dl className="agenticSummaryMetrics">
        <div>
          <dt>Phòng ban tham gia</dt>
          <dd>{participatingDepartments}/4</dd>
          <small>Trong lực lượng AI</small>
        </div>
        <div>
          <dt>Chi phí đã quyết toán</dt>
          <dd>{settledMicros} µcredits settled</dd>
          <small>{reservedMicros} µcredits reserved</small>
        </div>
        <div>
          <dt>Phê duyệt đang chờ</dt>
          <dd>{pendingApprovals}</dd>
          <small>Quyết định của con người</small>
        </div>
        <div>
          <dt>Đồng bộ gần nhất</dt>
          <dd><time dateTime={refreshedAt}>{new Date(refreshedAt).toLocaleTimeString()}</time></dd>
          <small>{new Date(refreshedAt).toLocaleDateString()}</small>
        </div>
      </dl>
    </section>
  );
}
function label(value: string): string { return value.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" "); }
