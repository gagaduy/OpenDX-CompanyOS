# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.agentic.infrastructure.keycloak import KeycloakWorkloadVerifier
from app.agentic.presentation.workload_auth import (
    WorkloadAuthenticationError,
    WorkloadAuthenticator,
)


def test_accepts_only_signed_agentic_control_identity() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    verifier = KeycloakWorkloadVerifier(
        issuer="https://identity.test/realms/opendx",
        audience="opendx-ai-runtime",
        authorized_client_id="opendx-agentic-control",
        verification_key=private_key.public_key(),
    )
    token = _token(private_key)

    principal = WorkloadAuthenticator(verifier).authenticate(f"Bearer {token}")

    assert principal.subject == "service-account-opendx-agentic-control"
    assert principal.client_id == "opendx-agentic-control"


@pytest.mark.parametrize(
    "overrides",
    [
        {"iss": "https://attacker.test"},
        {"aud": "opendx-api"},
        {"sub": ""},
        {"azp": "opendx-agentic-worker"},
        {"exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
    ],
)
def test_rejects_invalid_claim_boundaries(overrides: dict[str, object]) -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    verifier = KeycloakWorkloadVerifier(
        issuer="https://identity.test/realms/opendx",
        audience="opendx-ai-runtime",
        authorized_client_id="opendx-agentic-control",
        verification_key=private_key.public_key(),
    )

    with pytest.raises(WorkloadAuthenticationError):
        WorkloadAuthenticator(verifier).authenticate(
            f"Bearer {_token(private_key, overrides)}"
        )


def test_rejects_disallowed_algorithm_and_malformed_authorization() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    verifier = KeycloakWorkloadVerifier(
        issuer="https://identity.test/realms/opendx",
        audience="opendx-ai-runtime",
        authorized_client_id="opendx-agentic-control",
        verification_key=private_key.public_key(),
    )
    authenticator = WorkloadAuthenticator(verifier)

    with pytest.raises(WorkloadAuthenticationError):
        authenticator.authenticate("Basic credentials")
    with pytest.raises(WorkloadAuthenticationError):
        authenticator.authenticate(
            "Bearer " + jwt.encode(_claims(), "symmetric-secret-at-least-thirty-two-bytes", algorithm="HS256")
        )


def _token(private_key: object, overrides: dict[str, object] | None = None) -> str:
    return jwt.encode(
        {**_claims(), **(overrides or {})},
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )


def _claims() -> dict[str, object]:
    now = datetime.now(timezone.utc)
    return {
        "iss": "https://identity.test/realms/opendx",
        "aud": "opendx-ai-runtime",
        "sub": "service-account-opendx-agentic-control",
        "azp": "opendx-agentic-control",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
