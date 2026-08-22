// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { CrmNote } from "../entities/crm-note";
import type { Followup } from "../entities/followup";
import { CrmDomainError } from "../exceptions/crm-domain.error";
import {
  calculateSegments,
  claimFollowup,
  completeFollowup,
  createFollowup,
  createCorrection,
  createNote,
  isFollowupOverdue,
} from "./crm-rules";

const now = "2026-08-10T00:00:00.000Z";
const followup: Followup = {
  id: "followup-1",
  customerId: "customer-1",
  dueAt: "2026-08-11T00:00:00.000Z",
  description: "Call the customer about their order",
  status: "open",
  version: 1,
  createdById: "staff-creator",
  createdAt: now,
  updatedAt: now,
};

describe("CRM domain rules", () => {
  it.each([
    [{ paidOrderCount: 0, lifetimePaidVnd: 0 }, ["new_customer"]],
    [{ paidOrderCount: 1, lifetimePaidVnd: 49_999_999, latestPaidAt: now }, ["first_time_buyer"]],
    [{ paidOrderCount: 2, lifetimePaidVnd: 50_000_000, latestPaidAt: now }, ["repeat_customer", "high_value"]],
    [{ paidOrderCount: 2, lifetimePaidVnd: 50_000_000, latestPaidAt: "2026-05-12T00:00:00.001Z" }, ["repeat_customer", "high_value"]],
    [{ paidOrderCount: 2, lifetimePaidVnd: 50_000_000, latestPaidAt: "2026-05-12T00:00:00.000Z" }, ["repeat_customer", "high_value", "inactive_90d"]],
  ] as const)("calculates deterministic, ordered segments for %o", (facts, expected) => {
    expect(calculateSegments(facts, now)).toEqual(expected);
  });

  it("creates an immutable correction without changing its original note", () => {
    const original = createNote({
      id: "note-1", customerId: "customer-1", authorId: "staff-1",
      body: "  Called the customer.  ", createdAt: now,
    });
    const correction = createCorrection({
      id: "note-2", customerId: "customer-1", authorId: "staff-2",
      body: "  Customer asked to call tomorrow. ", createdAt: now,
    }, original);

    expect(original).toEqual<CrmNote>({
      id: "note-1", customerId: "customer-1", authorId: "staff-1",
      body: "Called the customer.", createdAt: now,
    });
    expect(correction).toEqual<CrmNote>({
      id: "note-2", customerId: "customer-1", authorId: "staff-2",
      body: "Customer asked to call tomorrow.", correctsNoteId: "note-1", createdAt: now,
    });
    expect(() => createNote({
      id: "note-empty", customerId: "customer-1", authorId: "staff-1", body: " ", createdAt: now,
    })).toThrowError(expect.objectContaining<Partial<CrmDomainError>>({ code: "INVALID_CRM_NOTE" }));
  });

  it("allows an open follow-up to be self-claimed once and converges same-assignee retries", () => {
    const claimed = claimFollowup(followup, "staff-operator", 1, now);

    expect(claimed).toMatchObject({
      assigneeId: "staff-operator", version: 2, updatedAt: now,
    });
    expect(claimFollowup(claimed, "staff-operator", 2, now)).toBe(claimed);
  });

  it("creates an open follow-up with a trimmed bounded description", () => {
    expect(createFollowup({
      id: "followup-2", customerId: "customer-1", dueAt: "2026-08-11T00:00:00.000Z",
      description: "  Check payment status.  ", createdById: "staff-creator", createdAt: now,
    })).toMatchObject({ description: "Check payment status.", status: "open", version: 1 });
    expect(() => createFollowup({
      id: "followup-empty", customerId: "customer-1", dueAt: "2026-08-11T00:00:00.000Z",
      description: " ", createdById: "staff-creator", createdAt: now,
    })).toThrowError(expect.objectContaining<Partial<CrmDomainError>>({ code: "INVALID_FOLLOWUP" }));
  });

  it("rejects a competing follow-up claim and stale version", () => {
    const claimed = claimFollowup(followup, "staff-operator", 1, now);

    expect(() => claimFollowup(claimed, "other-operator", 2, now))
      .toThrowError(expect.objectContaining<Partial<CrmDomainError>>({ code: "FOLLOWUP_ALREADY_ASSIGNED" }));
    expect(() => claimFollowup(followup, "staff-operator", 2, now))
      .toThrowError(expect.objectContaining<Partial<CrmDomainError>>({ code: "STALE_VERSION" }));
    expect(() => claimFollowup(claimed, "staff-operator", 1, now))
      .toThrowError(expect.objectContaining<Partial<CrmDomainError>>({ code: "STALE_VERSION" }));
  });

  it("completes an assigned open follow-up with completion actor and time", () => {
    const claimed = claimFollowup(followup, "staff-operator", 1, now);
    const completed = completeFollowup(claimed, "staff-operator", 2, "2026-08-10T01:00:00.000Z");

    expect(completed).toMatchObject({
      status: "completed", version: 3, completedById: "staff-operator",
      completedAt: "2026-08-10T01:00:00.000Z", updatedAt: "2026-08-10T01:00:00.000Z",
    });
    expect(() => completeFollowup(followup, "staff-operator", 1, now))
      .toThrowError(expect.objectContaining<Partial<CrmDomainError>>({ code: "FOLLOWUP_UNASSIGNED" }));
  });

  it("treats only open follow-ups strictly due before now as overdue", () => {
    expect(isFollowupOverdue({ ...followup, dueAt: "2026-08-09T23:59:59.999Z" }, now)).toBe(true);
    expect(isFollowupOverdue({ ...followup, dueAt: now }, now)).toBe(false);
    expect(isFollowupOverdue({ ...followup, status: "completed", dueAt: "2026-08-09T23:59:59.999Z" }, now)).toBe(false);
  });
});
