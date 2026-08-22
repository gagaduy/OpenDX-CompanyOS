# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import pytest

from app.shared.config import ConfigurationError, OpenRouterSettings, RuntimeSettings


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
    assert settings.activity.fake_delay_ms == 0
    assert settings.openrouter == OpenRouterSettings(
        execution_enabled=False,
        base_url="https://openrouter.ai/api/v1",
        api_key=None,
        public_attribution_url=None,
        public_attribution_name=None,
        maximum_response_bytes=1_048_576,
        catalog_cache_ttl_seconds=300,
    )


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
        ("FAKE_ACTIVITY_DELAY_MS", "60001"),
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


def test_fake_activity_delay_is_bounded_for_deterministic_lifecycle_checks() -> None:
    settings = RuntimeSettings.from_mapping(
        environment() | {"FAKE_ACTIVITY_DELAY_MS": "2500"}
    )

    assert settings.activity.fake_delay_ms == 2500


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


def test_openrouter_execution_requires_api_key() -> None:
    values = environment() | {"OPENROUTER_EXECUTION_ENABLED": "true"}

    with pytest.raises(ConfigurationError, match="OPENROUTER_API_KEY"):
        RuntimeSettings.from_mapping(values)


def test_openrouter_key_is_optional_while_execution_is_disabled() -> None:
    settings = RuntimeSettings.from_mapping(environment())

    assert settings.openrouter.execution_enabled is False
    assert settings.openrouter.api_key is None


def test_openrouter_secret_is_absent_from_repr() -> None:
    secret = "private-openrouter-secret"
    settings = RuntimeSettings.from_mapping(
        environment()
        | {
            "OPENROUTER_EXECUTION_ENABLED": "true",
            "OPENROUTER_API_KEY": secret,
        }
    )

    assert settings.openrouter.api_key == secret
    assert secret not in repr(settings.openrouter)
    assert secret not in repr(settings)


def test_openrouter_configuration_reads_bounded_public_values() -> None:
    settings = RuntimeSettings.from_mapping(
        environment()
        | {
            "OPENROUTER_EXECUTION_ENABLED": "true",
            "OPENROUTER_API_KEY": "private-key",
            "OPENROUTER_BASE_URL": "https://gateway.example/api/v1/",
            "OPENROUTER_PUBLIC_ATTRIBUTION_URL": "https://company.example/opendx",
            "OPENROUTER_PUBLIC_ATTRIBUTION_NAME": "OpenDX CompanyOS",
            "OPENROUTER_MAXIMUM_RESPONSE_BYTES": "2048",
            "OPENROUTER_CATALOG_CACHE_TTL_SECONDS": "60",
        }
    )

    assert settings.openrouter.base_url == "https://gateway.example/api/v1"
    assert settings.openrouter.public_attribution_url == "https://company.example/opendx"
    assert settings.openrouter.public_attribution_name == "OpenDX CompanyOS"
    assert settings.openrouter.maximum_response_bytes == 2048
    assert settings.openrouter.catalog_cache_ttl_seconds == 60


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("OPENROUTER_BASE_URL", "ftp://openrouter.ai/api/v1"),
        ("OPENROUTER_BASE_URL", "https://user:password@openrouter.ai/api/v1"),
        ("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1#fragment"),
        ("OPENROUTER_PUBLIC_ATTRIBUTION_URL", "javascript:alert(1)"),
        ("OPENROUTER_PUBLIC_ATTRIBUTION_URL", "https://user@company.example/path"),
        ("OPENROUTER_PUBLIC_ATTRIBUTION_URL", "https://company.example/path#fragment"),
    ],
)
def test_openrouter_urls_reject_unsafe_values(name: str, value: str) -> None:
    values = environment() | {
        "OPENROUTER_EXECUTION_ENABLED": "true",
        "OPENROUTER_API_KEY": "private-key",
        name: value,
    }

    with pytest.raises(ConfigurationError, match=name):
        RuntimeSettings.from_mapping(values)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("OPENROUTER_BASE_URL", "https://gateway.example:bad/api/v1"),
        ("OPENROUTER_BASE_URL", "https://gateway.example:65536/api/v1"),
        (
            "OPENROUTER_PUBLIC_ATTRIBUTION_URL",
            "https://company.example:bad/opendx",
        ),
        (
            "OPENROUTER_PUBLIC_ATTRIBUTION_URL",
            "https://company.example:65536/opendx",
        ),
    ],
)
def test_openrouter_urls_reject_invalid_ports_without_retaining_input(
    name: str, value: str
) -> None:
    values = environment() | {
        "OPENROUTER_EXECUTION_ENABLED": "true",
        "OPENROUTER_API_KEY": "private-key",
        name: value,
    }

    with pytest.raises(ConfigurationError) as captured:
        RuntimeSettings.from_mapping(values)

    assert captured.value.args == (f"{name} must contain a valid port",)
    assert captured.value.__cause__ is None
    assert value not in repr(captured.value)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("OPENROUTER_BASE_URL", "https://[broken.example/api/v1"),
        (
            "OPENROUTER_PUBLIC_ATTRIBUTION_URL",
            "https://[broken.example/opendx",
        ),
    ],
)
def test_openrouter_urls_reject_malformed_ipv6_without_retaining_input(
    name: str, value: str
) -> None:
    values = environment() | {
        "OPENROUTER_EXECUTION_ENABLED": "true",
        "OPENROUTER_API_KEY": "private-key",
        name: value,
    }

    with pytest.raises(ConfigurationError) as captured:
        RuntimeSettings.from_mapping(values)

    assert captured.value.args == (
        f"{name} must be a valid HTTP or HTTPS URL",
    )
    assert captured.value.__cause__ is None
    assert value not in repr(captured.value)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("AI_RUNTIME_PORT", "INTEGER-CANARY"),
        ("TEMPORAL_ADDRESS", f"temporal:{'9' * 5_000}"),
        ("OPENROUTER_BASE_URL", "https://[URL-CANARY/api/v1"),
        ("OPENROUTER_BASE_URL", "https://example.test:PORT-CANARY/api/v1"),
        (
            "OPENROUTER_PUBLIC_ATTRIBUTION_URL",
            "https://[ATTRIBUTION-CANARY/opendx",
        ),
    ],
)
def test_configuration_parse_failures_retain_no_untrusted_value(
    name: str, value: str
) -> None:
    values = environment() | {
        "OPENROUTER_EXECUTION_ENABLED": "true",
        "OPENROUTER_API_KEY": "private-key",
        name: value,
    }

    with pytest.raises(ConfigurationError) as captured:
        RuntimeSettings.from_mapping(values)

    assert captured.value.__cause__ is None
    assert captured.value.__context__ is None
    assert value not in _exception_chain_text(captured.value)


@pytest.mark.parametrize(
    "base_url",
    [
        "http://openrouter.ai/api/v1",
        "https://api.openrouter.ai/api/v1",
        "https://openrouter.ai/api/v2",
        "https://openrouter.ai/api/v1/extra",
        "https://openrouter.ai:444/api/v1",
    ],
)
def test_production_execution_requires_exact_official_openrouter_base(
    base_url: str,
) -> None:
    values = environment() | {
        "APP_ENV": "production",
        "TEMPORAL_TLS_ENABLED": "true",
        "TEMPORAL_TLS_CA_PATH": "/run/secrets/temporal-ca.pem",
        "TEMPORAL_TLS_CERT_PATH": "/run/secrets/temporal-client.pem",
        "TEMPORAL_TLS_KEY_PATH": "/run/secrets/temporal-client-key.pem",
        "TEMPORAL_TLS_SERVER_NAME": "temporal.internal",
        "OPENROUTER_EXECUTION_ENABLED": "true",
        "OPENROUTER_API_KEY": "private-key",
        "OPENROUTER_BASE_URL": base_url,
    }

    with pytest.raises(ConfigurationError, match="OPENROUTER_BASE_URL"):
        RuntimeSettings.from_mapping(values)


def test_production_execution_accepts_canonical_openrouter_base() -> None:
    values = environment() | {
        "APP_ENV": "production",
        "TEMPORAL_TLS_ENABLED": "true",
        "TEMPORAL_TLS_CA_PATH": "/run/secrets/temporal-ca.pem",
        "TEMPORAL_TLS_CERT_PATH": "/run/secrets/temporal-client.pem",
        "TEMPORAL_TLS_KEY_PATH": "/run/secrets/temporal-client-key.pem",
        "TEMPORAL_TLS_SERVER_NAME": "temporal.internal",
        "OPENROUTER_EXECUTION_ENABLED": "true",
        "OPENROUTER_API_KEY": "private-key",
    }

    settings = RuntimeSettings.from_mapping(values)

    assert settings.openrouter.base_url == "https://openrouter.ai/api/v1"


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("OPENROUTER_MAXIMUM_RESPONSE_BYTES", "0"),
        ("OPENROUTER_MAXIMUM_RESPONSE_BYTES", "10485761"),
        ("OPENROUTER_CATALOG_CACHE_TTL_SECONDS", "0"),
        ("OPENROUTER_CATALOG_CACHE_TTL_SECONDS", "3601"),
    ],
)
def test_openrouter_numeric_configuration_is_bounded(name: str, value: str) -> None:
    values = environment() | {name: value}

    with pytest.raises(ConfigurationError, match=name):
        RuntimeSettings.from_mapping(values)


def test_openrouter_public_name_is_bounded_and_header_safe() -> None:
    for value in ["x" * 129, "OpenDX\nInjected"]:
        values = environment() | {"OPENROUTER_PUBLIC_ATTRIBUTION_NAME": value}
        with pytest.raises(ConfigurationError, match="OPENROUTER_PUBLIC_ATTRIBUTION_NAME"):
            RuntimeSettings.from_mapping(values)


def _exception_chain_text(error: BaseException) -> str:
    pending: list[BaseException] = [error]
    seen: set[int] = set()
    rendered: list[str] = []
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        rendered.extend((repr(current), str(current), repr(current.args)))
        if current.__cause__ is not None:
            pending.append(current.__cause__)
        if current.__context__ is not None:
            pending.append(current.__context__)
    return " ".join(rendered)
