# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import pytest

from app.shared.config import ConfigurationError, RuntimeSettings


def environment() -> dict[str, str]:
    return {
        "APP_ENV": "development",
        "KEYCLOAK_ISSUER": "http://keycloak:8080/realms/opendx",
        "KEYCLOAK_JWKS_URL": "http://keycloak:8080/realms/opendx/protocol/openid-connect/certs",
        "KEYCLOAK_TOKEN_URL": "http://keycloak:8080/realms/opendx/protocol/openid-connect/token",
        "AGENTIC_CONTROL_AUDIENCE": "opendx-ai-runtime",
        "AGENTIC_CONTROL_CLIENT_ID": "opendx-agentic-control",
        "AGENTIC_WORKER_AUDIENCE": "opendx-api",
        "AGENTIC_WORKER_CLIENT_ID": "opendx-agentic-worker",
        "AGENTIC_WORKER_CLIENT_SECRET": "local-worker-secret",
        "AGENTIC_API_BASE_URL": "http://api:4000",
        "TEMPORAL_ADDRESS": "temporal:7233",
    }


def test_development_accepts_private_plaintext_temporal() -> None:
    settings = RuntimeSettings.from_mapping(environment())

    assert settings.environment == "development"
    assert settings.temporal.address == "temporal:7233"
    assert settings.temporal.namespace == "opendx"
    assert settings.temporal.task_queue == "store-health-v1"
    assert settings.temporal.tls is None
    assert settings.activity.start_to_close_seconds == 30
    assert settings.activity.schedule_to_close_seconds == 180


def test_production_requires_temporal_tls() -> None:
    values = environment() | {"APP_ENV": "production"}

    with pytest.raises(ConfigurationError, match="TEMPORAL_TLS_ENABLED"):
        RuntimeSettings.from_mapping(values)


def test_production_requires_complete_temporal_tls_material() -> None:
    values = environment() | {
        "APP_ENV": "production",
        "TEMPORAL_TLS_ENABLED": "true",
        "TEMPORAL_TLS_CA_PATH": "/run/secrets/temporal-ca.pem",
        "TEMPORAL_TLS_CERT_PATH": "/run/secrets/temporal-client.pem",
    }

    with pytest.raises(ConfigurationError, match="TEMPORAL_TLS_KEY_PATH"):
        RuntimeSettings.from_mapping(values)


def test_production_accepts_private_http_and_complete_temporal_tls() -> None:
    values = environment() | {
        "APP_ENV": "production",
        "AGENTIC_WORKER_CLIENT_SECRET": "production-worker-secret",
        "TEMPORAL_TLS_ENABLED": "true",
        "TEMPORAL_TLS_CA_PATH": "/run/secrets/temporal-ca.pem",
        "TEMPORAL_TLS_CERT_PATH": "/run/secrets/temporal-client.pem",
        "TEMPORAL_TLS_KEY_PATH": "/run/secrets/temporal-client-key.pem",
        "TEMPORAL_TLS_SERVER_NAME": "temporal.internal",
    }

    settings = RuntimeSettings.from_mapping(values)

    assert settings.environment == "production"
    assert settings.temporal.tls is not None
    assert settings.temporal.tls.server_name == "temporal.internal"
    assert settings.agentic_api_base_url == "http://api:4000"


@pytest.mark.parametrize(
    "name",
    [
        "AGENTIC_CONTROL_AUDIENCE",
        "AGENTIC_CONTROL_CLIENT_ID",
        "AGENTIC_WORKER_AUDIENCE",
        "AGENTIC_WORKER_CLIENT_ID",
        "AGENTIC_WORKER_CLIENT_SECRET",
    ],
)
def test_workload_identity_values_are_required(name: str) -> None:
    values = environment()
    values[name] = "  "

    with pytest.raises(ConfigurationError, match=name):
        RuntimeSettings.from_mapping(values)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("KEYCLOAK_ISSUER", "keycloak/realms/opendx"),
        ("KEYCLOAK_JWKS_URL", "ftp://keycloak/certs"),
        ("KEYCLOAK_TOKEN_URL", "not-a-url"),
        ("AGENTIC_API_BASE_URL", "postgres://api:4000"),
    ],
)
def test_http_boundaries_require_http_urls(name: str, value: str) -> None:
    values = environment()
    values[name] = value

    with pytest.raises(ConfigurationError, match=name):
        RuntimeSettings.from_mapping(values)


def test_production_rejects_plaintext_public_http_boundary() -> None:
    values = environment() | {
        "APP_ENV": "production",
        "AGENTIC_API_BASE_URL": "http://agents.example.com",
        "TEMPORAL_TLS_ENABLED": "true",
        "TEMPORAL_TLS_CA_PATH": "/run/secrets/temporal-ca.pem",
        "TEMPORAL_TLS_CERT_PATH": "/run/secrets/temporal-client.pem",
        "TEMPORAL_TLS_KEY_PATH": "/run/secrets/temporal-client-key.pem",
        "TEMPORAL_TLS_SERVER_NAME": "temporal.internal",
    }

    with pytest.raises(ConfigurationError, match="AGENTIC_API_BASE_URL"):
        RuntimeSettings.from_mapping(values)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("AI_RUNTIME_PORT", "0"),
        ("ACTIVITY_START_TO_CLOSE_SECONDS", "zero"),
        ("ACTIVITY_SCHEDULE_TO_CLOSE_SECONDS", "-1"),
        ("WORKER_SHUTDOWN_GRACE_SECONDS", "0"),
        ("COMMAND_RETRY_INTERVAL_SECONDS", "86401"),
    ],
)
def test_numeric_configuration_is_bounded(name: str, value: str) -> None:
    values = environment()
    values[name] = value

    with pytest.raises(ConfigurationError, match=name):
        RuntimeSettings.from_mapping(values)


def test_activity_schedule_timeout_covers_each_attempt() -> None:
    values = environment() | {
        "ACTIVITY_START_TO_CLOSE_SECONDS": "60",
        "ACTIVITY_SCHEDULE_TO_CLOSE_SECONDS": "30",
    }

    with pytest.raises(ConfigurationError, match="ACTIVITY_SCHEDULE_TO_CLOSE_SECONDS"):
        RuntimeSettings.from_mapping(values)


def test_from_environment_reads_process_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in environment().items():
        monkeypatch.setenv(name, value)

    settings = RuntimeSettings.from_environment()

    assert settings.keycloak.worker_client_id == "opendx-agentic-worker"
    assert isinstance(settings.keycloak.worker_client_secret, str)
    assert settings.temporal.namespace == "opendx"
    assert settings.bind_host == "0.0.0.0"
    assert settings.bind_port == 8000
    assert settings.temporal.tls is None
