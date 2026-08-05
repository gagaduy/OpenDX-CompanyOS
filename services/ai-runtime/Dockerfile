# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

FROM python:3.13.12-slim-bookworm@sha256:a58daefb915e1e03ad48f3ca4df8832065412c5c35cacb9d39f4229184de12b6

WORKDIR /workspace/services/ai-runtime
RUN useradd --create-home --uid 10001 opendx
COPY services/ai-runtime/pyproject.toml ./
COPY services/ai-runtime/app ./app
COPY services/ai-runtime/tests ./tests
RUN pip install --no-cache-dir --disable-pip-version-check '.[dev]'
RUN chown -R opendx:opendx /workspace/services/ai-runtime

USER opendx
CMD ["python", "-m", "pytest"]
