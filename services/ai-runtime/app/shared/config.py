# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import os
from dataclasses import dataclass, field as dataclass_field
from types import MappingProxyType
from typing import Literal, Mapping, cast
from urllib.parse import ParseResult, urlparse


Environment = Literal["development", "test", "production"]
DepartmentAgentKind = Literal[
    "catalog", "inventory", "order", "finance", "crm", "support",
    "marketing_content", "marketing_visual", "marketing_publisher"
]
DEPARTMENT_AGENT_KINDS: tuple[DepartmentAgentKind, ...] = (
    "catalog", "inventory", "order", "finance", "crm", "support",
    "marketing_content", "marketing_visual", "marketing_publisher"
)


class ConfigurationError(ValueError):
    """Raised when runtime configuration is absent or unsafe."""


@dataclass(frozen=True)
class TemporalTlsSettings:
    ca_path: str
    certificate_path: str
    key_path: str
    server_name: str


@dataclass(frozen=True)
class TemporalSettings:
    address: str
    namespace: str
    task_queue: str
    tls: TemporalTlsSettings | None


@dataclass(frozen=True)
class DepartmentIdentitySettings:
    client_id: str
    client_secret: str = dataclass_field(repr=False)


@dataclass(frozen=True)
class KeycloakSettings:
    issuer: str
    jwks_url: str
    token_url: str
    control_audience: str
    control_client_id: str
    worker_audience: str
    worker_client_id: str
    worker_client_secret: str = dataclass_field(repr=False)
    ai_ceo_identity: DepartmentIdentitySettings | None
    department_identities: Mapping[DepartmentAgentKind, DepartmentIdentitySettings]


@dataclass(frozen=True)
class ActivitySettings:
    start_to_close_seconds: int
    schedule_to_close_seconds: int
    fake_delay_ms: int


@dataclass(frozen=True)
class OpenRouterSettings:
    execution_enabled: bool
    base_url: str
    api_key: str | None = dataclass_field(repr=False)
    public_attribution_url: str | None
    public_attribution_name: str | None
    maximum_response_bytes: int
    catalog_cache_ttl_seconds: int


@dataclass(frozen=True)
class RuntimeSettings:
    environment: Environment
    bind_host: str
    bind_port: int
    keycloak: KeycloakSettings
    agentic_api_base_url: str
    department_tool_api_base_url: str
    temporal: TemporalSettings
    activity: ActivitySettings
    openrouter: OpenRouterSettings
    worker_shutdown_grace_seconds: int
    command_retry_interval_seconds: int
    orchestration_descriptor_execution_enabled: bool

    @classmethod
    def from_environment(cls) -> RuntimeSettings:
        return cls.from_mapping(os.environ)

    @classmethod
    def from_mapping(cls, values: Mapping[str, str]) -> RuntimeSettings:
        environment = _environment(values)
        start_to_close = _positive_integer(
            values, "ACTIVITY_START_TO_CLOSE_SECONDS", 30, maximum=86_400
        )
        schedule_to_close = _positive_integer(
            values, "ACTIVITY_SCHEDULE_TO_CLOSE_SECONDS", 180, maximum=86_400
        )
        if schedule_to_close < start_to_close:
            raise ConfigurationError(
                "ACTIVITY_SCHEDULE_TO_CLOSE_SECONDS must be greater than or equal "
                "to ACTIVITY_START_TO_CLOSE_SECONDS"
            )

        tls_enabled = _boolean(values, "TEMPORAL_TLS_ENABLED", False)
        if environment == "production" and not tls_enabled:
            raise ConfigurationError(
                "TEMPORAL_TLS_ENABLED must be true in production"
            )

        tls = None
        if tls_enabled:
            tls = TemporalTlsSettings(
                ca_path=_required(values, "TEMPORAL_TLS_CA_PATH"),
                certificate_path=_required(values, "TEMPORAL_TLS_CERT_PATH"),
                key_path=_required(values, "TEMPORAL_TLS_KEY_PATH"),
                server_name=_required(values, "TEMPORAL_TLS_SERVER_NAME"),
            )

        descriptor_execution_enabled = _boolean(
            values, "ORCHESTRATION_DESCRIPTOR_EXECUTION_ENABLED", False
        )
        ai_ceo_identity = None
        department_identities: dict[
            DepartmentAgentKind, DepartmentIdentitySettings
        ] = {}
        if descriptor_execution_enabled:
            ai_ceo_identity = DepartmentIdentitySettings(
                client_id=_required(values, "AGENT_AI_CEO_CLIENT_ID"),
                client_secret=_required(values, "AGENT_AI_CEO_CLIENT_SECRET"),
            )
            for agent_kind in DEPARTMENT_AGENT_KINDS:
                prefix = f"AGENT_{agent_kind.upper()}"
                department_identities[agent_kind] = DepartmentIdentitySettings(
                    client_id=_required(values, f"{prefix}_CLIENT_ID"),
                    client_secret=_required(values, f"{prefix}_CLIENT_SECRET"),
                )
        worker_client_id = _required(values, "AGENTIC_WORKER_CLIENT_ID")
        worker_client_secret = _required(values, "AGENTIC_WORKER_CLIENT_SECRET")
        if ai_ceo_identity is not None:
            _validate_distinct_agent_credentials(
                worker_client_id, worker_client_secret, ai_ceo_identity,
                tuple(department_identities.values()),
            )
        keycloak = KeycloakSettings(
            issuer=_http_url(values, "KEYCLOAK_ISSUER", environment),
            jwks_url=_http_url(values, "KEYCLOAK_JWKS_URL", environment),
            token_url=_http_url(values, "KEYCLOAK_TOKEN_URL", environment),
            control_audience=_required(values, "AGENTIC_CONTROL_AUDIENCE"),
            control_client_id=_required(values, "AGENTIC_CONTROL_CLIENT_ID"),
            worker_audience=_required(values, "AGENTIC_WORKER_AUDIENCE"),
            worker_client_id=worker_client_id,
            worker_client_secret=worker_client_secret,
            ai_ceo_identity=ai_ceo_identity,
            department_identities=MappingProxyType(department_identities),
        )

        openrouter_execution_enabled = _boolean(
            values, "OPENROUTER_EXECUTION_ENABLED", False
        )
        if descriptor_execution_enabled and not openrouter_execution_enabled:
            raise ConfigurationError(
                "OPENROUTER_EXECUTION_ENABLED must be true when descriptor execution is enabled"
            )
        openrouter_api_key = _optional(values, "OPENROUTER_API_KEY")
        if openrouter_execution_enabled and openrouter_api_key is None:
            raise ConfigurationError(
                "OPENROUTER_API_KEY is required when OpenRouter execution is enabled"
            )
        openrouter_base_url = _http_url_with_default(
            values,
            "OPENROUTER_BASE_URL",
            "https://openrouter.ai/api/v1",
        ).rstrip("/")
        if (
            environment == "production"
            and openrouter_execution_enabled
            and openrouter_base_url != "https://openrouter.ai/api/v1"
        ):
            raise ConfigurationError(
                "OPENROUTER_BASE_URL must use the official HTTPS OpenRouter API in production"
            )

        agentic_api_base_url = _http_url(
            values, "AGENTIC_API_BASE_URL", environment
        ).rstrip("/")
        department_tool_api_base_url = agentic_api_base_url
        if descriptor_execution_enabled:
            department_tool_api_base_url = _http_url(
                values, "DEPARTMENT_TOOL_API_BASE_URL", environment
            ).rstrip("/")

        return cls(
            environment=environment,
            bind_host=_value(values, "AI_RUNTIME_HOST", "0.0.0.0"),
            bind_port=_positive_integer(values, "AI_RUNTIME_PORT", 8000, maximum=65_535),
            keycloak=keycloak,
            agentic_api_base_url=agentic_api_base_url,
            department_tool_api_base_url=department_tool_api_base_url,
            temporal=TemporalSettings(
                address=_temporal_address(values),
                namespace=_value(values, "TEMPORAL_NAMESPACE", "opendx"),
                task_queue=_value(values, "TEMPORAL_TASK_QUEUE", "store-health-v1"),
                tls=tls,
            ),
            activity=ActivitySettings(
                start_to_close_seconds=start_to_close,
                schedule_to_close_seconds=schedule_to_close,
                fake_delay_ms=_nonnegative_integer(
                    values, "FAKE_ACTIVITY_DELAY_MS", 0, maximum=60_000
                ),
            ),
            openrouter=OpenRouterSettings(
                execution_enabled=openrouter_execution_enabled,
                base_url=openrouter_base_url,
                api_key=openrouter_api_key,
                public_attribution_url=_optional_http_url(
                    values, "OPENROUTER_PUBLIC_ATTRIBUTION_URL"
                ),
                public_attribution_name=_optional_header_value(
                    values, "OPENROUTER_PUBLIC_ATTRIBUTION_NAME", maximum=128
                ),
                maximum_response_bytes=_positive_integer(
                    values,
                    "OPENROUTER_MAXIMUM_RESPONSE_BYTES",
                    1_048_576,
                    maximum=10_485_760,
                ),
                catalog_cache_ttl_seconds=_positive_integer(
                    values,
                    "OPENROUTER_CATALOG_CACHE_TTL_SECONDS",
                    300,
                    maximum=3_600,
                ),
            ),
            worker_shutdown_grace_seconds=_positive_integer(
                values, "WORKER_SHUTDOWN_GRACE_SECONDS", 30, maximum=3_600
            ),
            command_retry_interval_seconds=_positive_integer(
                values, "COMMAND_RETRY_INTERVAL_SECONDS", 5, maximum=86_400
            ),
            orchestration_descriptor_execution_enabled=descriptor_execution_enabled,
        )


def _validate_distinct_agent_credentials(
    worker_client_id: str,
    worker_client_secret: str,
    ai_ceo: DepartmentIdentitySettings,
    departments: tuple[DepartmentIdentitySettings, ...],
) -> None:
    identities = (ai_ceo, *departments)
    client_ids = (worker_client_id, *(identity.client_id for identity in identities))
    secrets = (worker_client_secret, *(identity.client_secret for identity in identities))
    if len(set(client_ids)) != len(client_ids) or len(set(secrets)) != len(secrets):
        raise ConfigurationError(
            "Worker, AI CEO, and Department client IDs and secrets must be distinct"
        )


def _environment(values: Mapping[str, str]) -> Environment:
    value = _value(values, "APP_ENV", "development")
    if value not in {"development", "test", "production"}:
        raise ConfigurationError(
            "APP_ENV must be development, test, or production"
        )
    return cast(Environment, value)


def _value(values: Mapping[str, str], name: str, default: str) -> str:
    value = values.get(name, default).strip()
    if not value:
        raise ConfigurationError(f"{name} must not be empty")
    return value


def _required(values: Mapping[str, str], name: str) -> str:
    if name not in values:
        raise ConfigurationError(f"{name} is required")
    return _value(values, name, "")


def _optional(values: Mapping[str, str], name: str) -> str | None:
    raw = values.get(name)
    if raw is None:
        return None
    value = raw.strip()
    return value or None


def _positive_integer(
    values: Mapping[str, str], name: str, default: int, *, maximum: int
) -> int:
    raw = values.get(name, str(default)).strip()
    value = _try_integer(raw)
    if value is None:
        raise ConfigurationError(f"{name} must be an integer")
    if value < 1 or value > maximum:
        raise ConfigurationError(f"{name} must be between 1 and {maximum}")
    return value


def _nonnegative_integer(
    values: Mapping[str, str], name: str, default: int, *, maximum: int
) -> int:
    raw = values.get(name, str(default)).strip()
    value = _try_integer(raw)
    if value is None:
        raise ConfigurationError(f"{name} must be an integer")
    if value < 0 or value > maximum:
        raise ConfigurationError(f"{name} must be between 0 and {maximum}")
    return value


def _boolean(values: Mapping[str, str], name: str, default: bool) -> bool:
    raw = values.get(name, "true" if default else "false").strip().lower()
    if raw == "true":
        return True
    if raw == "false":
        return False
    raise ConfigurationError(f"{name} must be true or false")


def _http_url(
    values: Mapping[str, str], name: str, environment: Environment
) -> str:
    value = _required(values, name)
    parsed = _try_parse_http_url(value)
    if parsed is None:
        raise ConfigurationError(f"{name} must be a valid HTTP or HTTPS URL")
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ConfigurationError(f"{name} must be an HTTP or HTTPS URL")
    if not _has_valid_port(parsed):
        raise ConfigurationError(f"{name} must contain a valid port")
    if parsed.username or parsed.password or parsed.fragment:
        raise ConfigurationError(f"{name} must not contain credentials or fragments")
    if environment == "production" and parsed.scheme == "http":
        hostname = parsed.hostname
        private_service = "." not in hostname or hostname.endswith(".internal")
        if not private_service or hostname in {"localhost", "127.0.0.1", "::1"}:
            raise ConfigurationError(
                f"{name} must use HTTPS outside the private service network"
            )
    return value


def _http_url_with_default(
    values: Mapping[str, str], name: str, default: str
) -> str:
    value = _value(values, name, default)
    _validate_http_url(value, name)
    return value


def _optional_http_url(values: Mapping[str, str], name: str) -> str | None:
    value = _optional(values, name)
    if value is None:
        return None
    _validate_http_url(value, name)
    return value


def _validate_http_url(value: str, name: str) -> None:
    parsed = _try_parse_http_url(value)
    if parsed is None:
        raise ConfigurationError(f"{name} must be a valid HTTP or HTTPS URL")
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ConfigurationError(f"{name} must be an HTTP or HTTPS URL")
    if not _has_valid_port(parsed):
        raise ConfigurationError(f"{name} must contain a valid port")
    if parsed.username or parsed.password or parsed.fragment:
        raise ConfigurationError(f"{name} must not contain credentials or fragments")


def _try_integer(raw: str) -> int | None:
    try:
        return int(raw)
    except ValueError:
        return None


def _try_parse_http_url(value: str) -> ParseResult | None:
    try:
        return urlparse(value)
    except ValueError:
        return None


def _has_valid_port(parsed: ParseResult) -> bool:
    try:
        parsed.port
    except ValueError:
        return False
    return True


def _optional_header_value(
    values: Mapping[str, str], name: str, *, maximum: int
) -> str | None:
    value = _optional(values, name)
    if value is None:
        return None
    if len(value) > maximum or "\r" in value or "\n" in value:
        raise ConfigurationError(f"{name} must be a safe value up to {maximum} characters")
    return value


def _temporal_address(values: Mapping[str, str]) -> str:
    address = _required(values, "TEMPORAL_ADDRESS")
    if "://" in address or address.startswith(":") or address.endswith(":"):
        raise ConfigurationError("TEMPORAL_ADDRESS must use host:port syntax")
    host, separator, port = address.rpartition(":")
    parsed_port = _try_integer(port) if port.isdigit() else None
    if (
        not separator
        or not host
        or parsed_port is None
        or not 1 <= parsed_port <= 65_535
    ):
        raise ConfigurationError("TEMPORAL_ADDRESS must use host:port syntax")
    return address
