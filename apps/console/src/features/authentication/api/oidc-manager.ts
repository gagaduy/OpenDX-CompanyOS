// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  UserManager,
  WebStorageStateStore,
  type User,
} from "oidc-client-ts";
import type { ConsoleEnvironment } from "../../../app/environment";

export type StaffRole = "administrator" | "catalog_manager";

export interface AuthSession {
  readonly accessToken: string;
  readonly subject: string;
  readonly displayName: string;
  readonly roles: readonly StaffRole[];
}

export interface AuthClient {
  getSession(): Promise<AuthSession | null>;
  signIn(): Promise<void>;
  completeSignIn(): Promise<AuthSession>;
  signOut(): Promise<void>;
}

export function createOidcAuthClient(environment: ConsoleEnvironment): AuthClient {
  const manager = new UserManager({
    authority: environment.oidcAuthority,
    client_id: environment.oidcClientId,
    redirect_uri: environment.oidcRedirectUri,
    post_logout_redirect_uri: environment.oidcPostLogoutRedirectUri,
    response_type: "code",
    scope: "openid profile email roles",
    automaticSilentRenew: false,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });

  return {
    async getSession() {
      const user = await manager.getUser();
      return user === null || user.expired ? null : mapUser(user);
    },
    async signIn() {
      await manager.signinRedirect();
    },
    async completeSignIn() {
      return mapUser(await manager.signinRedirectCallback());
    },
    async signOut() {
      await manager.signoutRedirect();
    },
  };
}

function mapUser(user: User): AuthSession {
  const realmAccess = user.profile.realm_access;
  const rawRoles =
    typeof realmAccess === "object" && realmAccess !== null
      ? (realmAccess as { roles?: unknown }).roles
      : undefined;
  const roles = Array.isArray(rawRoles)
    ? rawRoles.filter(isStaffRole)
    : [];
  return {
    accessToken: user.access_token,
    subject: user.profile.sub,
    displayName:
      typeof user.profile.name === "string"
        ? user.profile.name
        : user.profile.preferred_username ?? user.profile.sub,
    roles,
  };
}

function isStaffRole(value: unknown): value is StaffRole {
  return value === "administrator" || value === "catalog_manager";
}
