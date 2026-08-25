// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./app";

describe("Storefront App", () => {
  it("renders NovaCommerce as a semantic customer storefront", () => {
    render(
      <App
        environment={{
          apiBaseUrl: "http://localhost:4000",
          storefrontOrigin: "http://localhost:3100",
        }}
      />,
    );

    expect(screen.getByRole("banner")).toHaveTextContent("NovaCommerce");
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải cửa hàng");
  });

  it("waits for customer session restoration before loading the cart", async () => {
    const session = deferred<Response>();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/v1/storefront/session")) return session.promise;
        if (url.includes("/v1/storefront/products"))
          return json({
            success: true,
            message: "Products retrieved",
            data: [],
            meta: { page: 1, pageSize: 12, totalItems: 0, totalPages: 0 },
          });
        if (url.endsWith("/v1/storefront/categories"))
          return json({
            success: true,
            message: "Categories retrieved",
            data: [],
          });
        if (url.endsWith("/v1/storefront/cart"))
          return json({
            success: true,
            message: "Cart retrieved",
            data: {
              ownerKind: "anonymous",
              version: 0,
              status: "empty",
              items: [],
              itemCount: 0,
              totalVnd: 0,
              requiresAction: false,
            },
          });
        throw new Error(`Unexpected storefront request ${url}`);
      });

    render(
      <App
        environment={{
          apiBaseUrl: "http://localhost:4000",
          storefrontOrigin: "http://localhost:3100",
        }}
      />,
    );

    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([input]) =>
          String(input).endsWith("/v1/storefront/session"),
        ),
      ).toBe(true),
    );
    expect(
      fetch.mock.calls.some(([input]) =>
        String(input).endsWith("/v1/storefront/cart"),
      ),
    ).toBe(false);

    session.resolve(
      json({
        success: true,
        message: "Anonymous session",
        data: { kind: "anonymous" },
      }),
    );

    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([input]) =>
          String(input).endsWith("/v1/storefront/cart"),
        ),
      ).toBe(true),
    );
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
