<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Coding Conventions

These conventions apply to new code and separately approved refactors. Follow
the repository's current formatter and lint commands when present; do not add a
tool solely because this document mentions a convention.

## General

- Name files, types, functions, and variables after their responsibility.
- Keep one primary responsibility per function, class, and module.
- Prefer small cohesive files over broad utility files.
- Avoid duplicated business rules and speculative abstractions.
- Read configuration from validated environment or configuration modules.
- Never commit secrets, credentials, tokens, or production identifiers.
- Comment decisions and non-obvious constraints, not syntax already expressed
  by the code.
- Add Apache-2.0 SPDX headers to new license-capable files.

## TypeScript and Express

- Keep TypeScript strict mode enabled.
- Avoid `any`; accept `unknown` at untrusted boundaries and narrow it.
- Validate route params, query values, headers, and bodies before use.
- Do not cast untrusted strings into branded or template-literal IDs as a
  substitute for validation.
- Keep routes thin and controllers free of business logic.
- Define service and repository interfaces around required use cases.
- Inject dependencies through constructors or explicit factories.
- Keep database and external SDK access in infrastructure implementations.
- Return response DTOs rather than persistence entities.
- Use mappers when internal and external contracts differ or need defensive
  copying.
- Translate errors centrally and do not expose stack traces or secret-bearing
  exception messages.

Representative contract:

```ts
export interface IUserService {
  getUserById(userId: string): Promise<UserResponseDto>;
}

export class UserService implements IUserService {
  constructor(private readonly userRepository: IUserRepository) {}

  async getUserById(userId: string): Promise<UserResponseDto> {
    // Application policy and coordination belong here.
  }
}
```

This shape is illustrative. Do not create it until an approved user use case
requires it.

## API DTOs

Use purpose-specific DTOs when create, update, list, and detail use cases expose
different fields. Do not use one mutable DTO for unrelated operations.

Business API responses should converge on a consistent envelope when an
approved API-contract change introduces it:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {},
  "meta": {}
}
```

```json
{
  "success": false,
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "errors": []
}
```

Existing endpoints retain their documented contract until a focused migration
updates implementation, tests, consumers, and API documentation together.

## Python

- Type public functions and boundary methods completely.
- Use Pydantic models for request and response schemas.
- Use `Protocol`, `ABC`, or abstract methods when a boundary needs
  substitution.
- Keep FastAPI routers focused on transport concerns.
- Keep business rules in services and database queries in repository adapters.
- Compose dependencies with explicit factories or FastAPI dependency
  functions.
- Translate known exceptions centrally and hide internal errors from clients.

## React

- Organize code by feature rather than global component, hook, service, and type
  buckets.
- Keep API calls outside presentational components.
- Type props, requests, responses, and feature state explicitly.
- Validate external data before relying on it.
- Separate container and presentational responsibilities when the distinction
  removes real complexity.
- Model loading, empty, error, and success states explicitly.
- Keep state local or feature scoped until multiple features require shared
  ownership.
- Reuse components after proven repetition; do not generalize a one-off view.
- Keep components short enough that their responsibility is easy to inspect.
- Follow [`linear-product-canvas.md`](../design/linear-product-canvas.md) for all
  visual work.

## File and Import Rules

- Use clear kebab-case filenames unless a language convention requires
  otherwise.
- Import another feature or module through its public API.
- Avoid circular dependencies.
- Keep tests close to focused units or under the owning module's integration
  test directory.
- Create directories only with their first real source or test file.

See [`dependency-rules.md`](../architecture/dependency-rules.md) for the
normative dependency matrix.
