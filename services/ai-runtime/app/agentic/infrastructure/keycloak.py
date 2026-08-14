# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from typing import Any

import httpx
import jwt

from app.agentic.domain.contracts import WorkloadPrincipal


class WorkloadTokenError(ValueError):
    pass


class KeycloakTokenError(RuntimeError):
    pass


class KeycloakWorkloadVerifier:
    def __init__(self, *, issuer: str, audience: str, authorized_client_id: str,
                 verification_key: Any | None = None,
                 jwks_url: str | None = None) -> None:
        self._issuer = issuer.rstrip("/")
        self._audience = audience
        self._client_id = authorized_client_id
        self._key = verification_key
        self._jwks = jwt.PyJWKClient(jwks_url) if jwks_url is not None else None
        if self._key is None and self._jwks is None:
            raise ValueError("A verification key or JWKS URL is required")

    def verify(self, token: str) -> WorkloadPrincipal:
        try:
            key = self._key
            if key is None:
                key = self._jwks.get_signing_key_from_jwt(token).key  # type: ignore[union-attr]
            payload = jwt.decode(
                token, key, algorithms=["RS256"], issuer=self._issuer,
                audience=self._audience,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )
            subject = payload.get("sub")
            client_id = payload.get("azp", payload.get("client_id"))
            if not isinstance(subject, str) or not subject or client_id != self._client_id:
                raise WorkloadTokenError("WORKLOAD_TOKEN_INVALID")
            return WorkloadPrincipal(subject=subject, client_id=client_id)
        except (jwt.PyJWTError, ValueError, TypeError) as error:
            raise WorkloadTokenError("WORKLOAD_TOKEN_INVALID") from error


class KeycloakClientCredentialsProvider:
    def __init__(self, *, token_url: str, client_id: str, client_secret: str,
                 audience: str, client: httpx.AsyncClient,
                 now: Callable[[], float] = time.time,
                 expiry_skew_seconds: int = 10) -> None:
        self._token_url = token_url
        self._client_id = client_id
        self._client_secret = client_secret
        self._audience = audience
        self._client = client
        self._now = now
        self._skew = expiry_skew_seconds
        self._cached: tuple[str, float] | None = None
        self._refresh: asyncio.Task[str] | None = None

    async def get_token(self) -> str:
        if self._cached is not None and self._now() < self._cached[1] - self._skew:
            return self._cached[0]
        if self._refresh is None:
            self._refresh = asyncio.create_task(self._acquire())
        try:
            return await self._refresh
        finally:
            if self._refresh is not None and self._refresh.done():
                self._refresh = None

    async def _acquire(self) -> str:
        try:
            response = await self._client.post(self._token_url, data={
                "grant_type": "client_credentials", "client_id": self._client_id,
                "client_secret": self._client_secret, "audience": self._audience,
            })
        except httpx.HTTPError as error:
            raise KeycloakTokenError("KEYCLOAK_TOKEN_TRANSPORT_FAILED") from error
        if not response.is_success:
            raise KeycloakTokenError("KEYCLOAK_TOKEN_REJECTED")
        try:
            value = response.json()
            token = value["access_token"]
            token_type = value["token_type"]
            expires_in = value["expires_in"]
            if (not isinstance(token, str) or not token or len(token) > 16_384
                    or str(token_type).lower() != "bearer"
                    or not isinstance(expires_in, int) or expires_in < 1):
                raise ValueError
        except (ValueError, KeyError, TypeError) as error:
            raise KeycloakTokenError("KEYCLOAK_TOKEN_RESPONSE_INVALID") from error
        self._cached = (token, self._now() + expires_in)
        return token
