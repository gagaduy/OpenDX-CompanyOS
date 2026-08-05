// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { CatalogDomainError } from "../exceptions/catalog-domain.error";
import { createMoney } from "../value-objects/money";
import { normalizeSku } from "../value-objects/sku";
import { normalizeSlug } from "../value-objects/slug";
import {
  assertAttributes,
  assertProductMutable,
  assertSinglePrimaryMedia,
  assertVariantOptions,
} from "./catalog-rules";

describe("catalog domain rules", () => {
  it("normalizes Vietnamese product names into stable slugs", () => {
    expect(normalizeSlug("  Bình Giữ Nhiệt  ")).toBe("binh-giu-nhiet");
    expect(normalizeSlug("Điện thoại Đỏ")).toBe("dien-thoai-do");
  });

  it("normalizes stock keeping units", () => {
    expect(normalizeSku(" nc bottle black ")).toBe("NC BOTTLE BLACK");
    expect(normalizeSku("nc   bottle\tblack")).toBe("NC BOTTLE BLACK");
  });

  it("creates positive safe VND money", () => {
    expect(createMoney(1_299_000, "VND")).toEqual({
      amountMinor: 1_299_000,
      currency: "VND",
      taxInclusive: true,
    });
    expect(() => createMoney(0, "VND")).toThrow(CatalogDomainError);
    expect(() => createMoney(Number.MAX_SAFE_INTEGER + 1, "VND")).toThrow(
      CatalogDomainError,
    );
  });

  it("prevents mutation of archived products", () => {
    expect(() => assertProductMutable("archived")).toThrow(CatalogDomainError);
    expect(() => assertProductMutable("draft")).not.toThrow();
    expect(() => assertProductMutable("published")).not.toThrow();
  });

  it("accepts only approved JSONB attribute values", () => {
    expect(() =>
      assertAttributes({
        color: "Black",
        weight: 1.2,
        rechargeable: true,
        tags: ["portable", "sale"],
      }),
    ).not.toThrow();
    expect(() => assertAttributes({ nested: { unsafe: true } })).toThrow(
      CatalogDomainError,
    );
  });

  it("requires non-empty variant option values", () => {
    expect(() => assertVariantOptions({ color: "Black" })).not.toThrow();
    expect(() => assertVariantOptions({})).toThrow(CatalogDomainError);
    expect(() => assertVariantOptions({ color: " " })).toThrow(
      CatalogDomainError,
    );
  });

  it("allows at most one primary media item", () => {
    expect(() =>
      assertSinglePrimaryMedia([{ isPrimary: true }, { isPrimary: false }]),
    ).not.toThrow();
    expect(() =>
      assertSinglePrimaryMedia([{ isPrimary: true }, { isPrimary: true }]),
    ).toThrow(CatalogDomainError);
  });
});
