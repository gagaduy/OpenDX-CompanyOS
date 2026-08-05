// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { ApplicationError } from "../http/application-error";
import type { StaffPrincipal, StaffRole } from "./staff-principal";

export interface StaffTokenVerifier {
  verify(token: string): Promise<JWTPayload>;
}

export interface RemoteStaffTokenVerifierOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUrl?: string;
}

const STAFF_ROLES = new Set<StaffRole>([
  "administrator",
  "catalog_manager",
]);

export function createRemoteStaffTokenVerifier(
  options: RemoteStaffTokenVerifierOptions,
): StaffTokenVerifier {
  const issuer = options.issuer.replace(/\/$/, "");
  const jwks = createRemoteJWKSet(
    new URL(options.jwksUrl ?? `${issuer}/protocol/openid-connect/certs`),
  );

  return {
    async verify(token) {
      const result = await jwtVerify(token, jwks, {
        issuer,
        audience: options.audience,
      });
      return result.payload;
    },
  };
}

export function authenticateStaff(verifier: StaffTokenVerifier): RequestHandler {
  return async (request, response, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(request.header("authorization") ?? "");
    if (match?.[1] === undefined) {
      next(unauthorized());
      return;
    }

    try {
      response.locals.staffPrincipal = toStaffPrincipal(
        await verifier.verify(match[1]),
      );
      next();
    } catch {
      next(unauthorized());
    }
  };
}

function toStaffPrincipal(payload: JWTPayload): StaffPrincipal {
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Token subject is missing");
  }
  const displayName = payload.name;
  if (typeof displayName !== "string" || displayName.trim().length === 0) {
    throw new Error("Token display name is missing");
  }

  const realmAccess = payload.realm_access;
  const rawRoles =
    typeof realmAccess === "object" && realmAccess !== null
      ? (realmAccess as { roles?: unknown }).roles
      : undefined;
  const roles = Array.isArray(rawRoles)
    ? [...new Set(rawRoles.filter(isStaffRole))]
    : [];

  return {
    subject: payload.sub,
    displayName,
    ...(typeof payload.email === "string" ? { email: payload.email } : {}),
    roles,
  };
}

function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && STAFF_ROLES.has(value as StaffRole);
}

function unauthorized(): ApplicationError {
  return new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
}
