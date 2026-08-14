# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal, Mapping, cast
from urllib.parse import urlparse


Environment = Literal["development", "test", "production"]


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
class KeycloakSettings:
    issuer: str
    jwks_url: str
    token_url: str
    control_audience: str
    control_client_id: str
    worker_audience: str
    worker_client_id: str
    worker_client_secret: str


@dataclass(frozen=True)
class ActivitySettings:
    start_to_close_seconds: int
    schedule_to_close_seconds: int


@dataclass(frozen=True)
class RuntimeSettings:
    environment: Environment
    bind_host: str
    bind_port: int
    keycloak: KeycloakSettings
    agentic_api_base_url: str
    temporal: TemporalSettings
    activity: ActivitySettings
    worker_shutdown_grace_seconds: int
    command_retry_interval_seconds: int

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

        keycloak = KeycloakSettings(
            issuer=_http_url(values, "KEYCLOAK_ISSUER", environment),
            jwks_url=_http_url(values, "KEYCLOAK_JWKS_URL", environment),
            token_url=_http_url(values, "KEYCLOAK_TOKEN_URL", environment),
            control_audience=_required(values, "AGENTIC_CONTROL_AUDIENCE"),
            control_client_id=_required(values, "AGENTIC_CONTROL_CLIENT_ID"),
            worker_audience=_required(values, "AGENTIC_WORKER_AUDIENCE"),
            worker_client_id=_required(values, "AGENTIC_WORKER_CLIENT_ID"),
            worker_client_secret=_required(
                values, "AGENTIC_WORKER_CLIENT_SECRET"
            ),
        )

        return cls(
            environment=environment,
            bind_host=_value(values, "AI_RUNTIME_HOST", "0.0.0.0"),
            bind_port=_positive_integer(values, "AI_RUNTIME_PORT", 8000, maximum=65_535),
            keycloak=keycloak,
            agentic_api_base_url=_http_url(
                values, "AGENTIC_API_BASE_URL", environment
            ).rstrip("/"),
            temporal=TemporalSettings(
                address=_temporal_address(values),
                namespace=_value(values, "TEMPORAL_NAMESPACE", "opendx"),
                task_queue=_value(values, "TEMPORAL_TASK_QUEUE", "store-health-v1"),
                tls=tls,
            ),
            activity=ActivitySettings(
                start_to_close_seconds=start_to_close,
                schedule_to_close_seconds=schedule_to_close,
            ),
            worker_shutdown_grace_seconds=_positive_integer(
                values, "WORKER_SHUTDOWN_GRACE_SECONDS", 30, maximum=3_600
            ),
            command_retry_interval_seconds=_positive_integer(
                values, "COMMAND_RETRY_INTERVAL_SECONDS", 5, maximum=86_400
            ),
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


def _positive_integer(
    values: Mapping[str, str], name: str, default: int, *, maximum: int
) -> int:
    raw = values.get(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as error:
        raise ConfigurationError(f"{name} must be an integer") from error
    if value < 1 or value > maximum:
        raise ConfigurationError(f"{name} must be between 1 and {maximum}")
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
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ConfigurationError(f"{name} must be an HTTP or HTTPS URL")
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


def _temporal_address(values: Mapping[str, str]) -> str:
    address = _required(values, "TEMPORAL_ADDRESS")
    if "://" in address or address.startswith(":") or address.endswith(":"):
        raise ConfigurationError("TEMPORAL_ADDRESS must use host:port syntax")
    host, separator, port = address.rpartition(":")
    if not separator or not host or not port.isdigit() or not 1 <= int(port) <= 65_535:
        raise ConfigurationError("TEMPORAL_ADDRESS must use host:port syntax")
    return address
