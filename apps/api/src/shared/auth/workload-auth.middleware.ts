// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { ApplicationError } from "../http/application-error";
import type { WorkloadPrincipal } from "./workload-principal";

const AGENTIC_WORKER_CLIENT_ID = "opendx-agentic-worker";

export interface WorkloadTokenVerifier {
  verify(token: string): Promise<JWTPayload>;
}

export interface RemoteWorkloadTokenVerifierOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUrl?: string;
}

export function createRemoteWorkloadTokenVerifier(
  options: RemoteWorkloadTokenVerifierOptions,
): WorkloadTokenVerifier {
  const issuer = options.issuer.replace(/\/$/, "");
  const jwks = createRemoteJWKSet(
    new URL(options.jwksUrl ?? `${issuer}/protocol/openid-connect/certs`),
  );

  return {
    async verify(token) {
      return (await jwtVerify(token, jwks, {
        issuer,
        audience: options.audience,
      })).payload;
    },
  };
}

export function authenticateWorkload(
  verifier: WorkloadTokenVerifier,
): RequestHandler {
  return async (request, response, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(request.header("authorization") ?? "");
    if (match?.[1] === undefined) {
      next(unauthorized());
      return;
    }

    try {
      const payload = await verifier.verify(match[1]);
      response.locals.workloadPrincipal = toWorkloadPrincipal(payload);
      next();
    } catch {
      next(unauthorized());
    }
  };
}

function toWorkloadPrincipal(payload: JWTPayload): WorkloadPrincipal {
  const clientId = typeof payload.azp === "string"
    ? payload.azp
    : typeof payload.client_id === "string"
      ? payload.client_id
      : undefined;
  if (
    typeof payload.sub !== "string"
    || payload.sub.length === 0
    || clientId !== AGENTIC_WORKER_CLIENT_ID
  ) {
    throw new Error("Workload identity is invalid");
  }
  return {
    subject: payload.sub,
    clientId,
    workload: "agentic_worker",
  };
}

function unauthorized(): ApplicationError {
  return new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
}
