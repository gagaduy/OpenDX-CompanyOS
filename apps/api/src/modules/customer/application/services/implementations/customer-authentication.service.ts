// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { GoogleIdentityVerifier } from "../../identity/google-identity-verifier";
import type { CustomerAuditRepository } from "../../repositories/interfaces/customer-audit.repository";
import type { CustomerRepository } from "../../repositories/interfaces/customer.repository";
import type { SessionTokenService } from "../../security/session-token-service";
import {
  CUSTOMER_SESSION_TTL_MS,
  sessionExpiresAt,
  validateVerifiedIdentity,
} from "../../../domain/services/customer-rules";
import { CustomerApplicationError } from "../customer-application.error";
import type { CustomerAuthenticationServiceContract } from "../interfaces/customer-authentication.service";

export class CustomerAuthenticationService
  implements CustomerAuthenticationServiceContract
{
  constructor(
    private readonly repo: CustomerRepository,
    private readonly audit: CustomerAuditRepository,
    private readonly tx: TransactionRunner,
    private readonly verifier: GoogleIdentityVerifier,
    private readonly tokens: SessionTokenService,
    private readonly id: () => string,
    private readonly now: () => string,
  ) {}
  async loginWithGoogle(credential: string) {
    let identity;
    try {
      identity = await this.verifier.verify(credential);
    } catch {
      throw new CustomerApplicationError(
        "GOOGLE_TOKEN_INVALID",
        "Google credential is invalid",
      );
    }
    validateVerifiedIdentity(identity);
    const at = this.now();
    return this.tx.run(async (s) => {
      await this.repo.lockIdentityRegistration(
        s,
        "google",
        identity.subject,
        identity.email,
      );
      const existing = await this.repo.findIdentity(
        s,
        "google",
        identity.subject,
      );
      let customer;
      if (existing !== undefined) {
        customer = await this.repo.findCustomerById(s, existing.customerId);
        if (customer === undefined)
          throw new CustomerApplicationError(
            "GOOGLE_TOKEN_INVALID",
            "Customer identity is invalid",
          );
        await this.repo.touchIdentity(s, existing.id, identity.email, at);
      } else {
        if (await this.repo.findCustomerByEmail(s, identity.email))
          throw new CustomerApplicationError(
            "GOOGLE_IDENTITY_CONFLICT",
            "Verified email belongs to another identity",
          );
        customer = {
          id: this.id(),
          email: identity.email,
          emailVerifiedAt: identity.verifiedAt,
          status: "active" as const,
          version: 1,
          createdAt: at,
          updatedAt: at,
        };
        await this.repo.createCustomer(s, customer);
        await this.repo.createIdentity(
          s,
          {
            id: this.id(),
            customerId: customer.id,
            provider: "google",
            providerSubject: identity.subject,
            providerEmail: identity.email,
          },
          at,
        );
      }
      if (customer.status !== "active")
        throw new CustomerApplicationError(
          "CUSTOMER_DISABLED",
          "Customer is disabled",
        );
      const token = this.tokens.generate();
      const session = {
        id: this.id(),
        customerId: customer.id,
        tokenHash: token.hash,
        expiresAt: sessionExpiresAt(at, CUSTOMER_SESSION_TTL_MS),
        lastSeenAt: at,
        createdAt: at,
      };
      await this.repo.createCustomerSession(s, session);
      await this.audit.append(s, {
        id: this.id(),
        actorId: customer.id,
        action: "customer.auth.login",
        resourceType: "customer_session",
        resourceId: session.id,
        outcome: "success",
        correlationId: session.id,
        occurredAt: at,
      });
      return {
        rawToken: token.raw,
        principal: {
          customerId: customer.id,
          sessionId: session.id,
          email: customer.email,
          expiresAt: session.expiresAt,
        },
      };
    });
  }
  async logout(rawToken: string) {
    const hash = this.tokens.hash(rawToken),
      at = this.now();
    await this.tx.run(async (s) => {
      const found = await this.repo.findCustomerSessionByHash(s, hash, true);
      if (found !== undefined) {
        await this.repo.revokeCustomerSession(s, found.id, at);
        await this.audit.append(s, {
          id: this.id(),
          actorId: found.customerId,
          action: "customer.auth.logout",
          resourceType: "customer_session",
          resourceId: found.id,
          outcome: "success",
          correlationId: found.id,
          occurredAt: at,
        });
      }
    });
  }
}
