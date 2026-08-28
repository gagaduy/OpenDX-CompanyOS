// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  parseStorefrontHeroDisableArguments,
  parseStorefrontHeroImportArguments,
  parseStorefrontHeroImportConfig,
} from "./storefront-hero-import.config";

const validConfig = {
  code: "nova-signal",
  chapters: [
    {
      categorySlug: "laptops",
      sortOrder: 0,
      startMs: 0,
      endMs: 4_000,
      label: "Laptop nổi bật",
    },
  ],
};

describe("Storefront hero import configuration", () => {
  it("parses one explicit video file and one explicit configuration file", () => {
    expect(
      parseStorefrontHeroImportArguments([
        "--file",
        "/imports/hero.mp4",
        "--config",
        "/workspace/nova-signal-hero.json",
      ]),
    ).toEqual({
      filePath: "/imports/hero.mp4",
      configPath: "/workspace/nova-signal-hero.json",
    });
  });

  it.each([
    ["missing --file", ["--config", "hero.json"]],
    ["missing --config", ["--file", "hero.mp4"]],
    ["missing a flag value", ["--file", "--config", "hero.json"]],
    ["unknown flags", ["--file", "hero.mp4", "--config", "hero.json", "--force", "true"]],
    ["duplicate --file", ["--file", "one.mp4", "--file", "two.mp4", "--config", "hero.json"]],
    ["duplicate --config", ["--file", "hero.mp4", "--config", "one.json", "--config", "two.json"]],
  ])("rejects %s", (_description, arguments_) => {
    expect(() => parseStorefrontHeroImportArguments(arguments_)).toThrow(
      "Expected exactly --file <path> and --config <path>",
    );
  });

  it("validates the code and chapter JSON shape", () => {
    expect(parseStorefrontHeroImportConfig(JSON.stringify(validConfig))).toEqual(validConfig);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseStorefrontHeroImportConfig("{")).toThrow();
  });

  it("rejects invalid chapter values", () => {
    expect(() =>
      parseStorefrontHeroImportConfig(
        JSON.stringify({
          ...validConfig,
          chapters: [{ ...validConfig.chapters[0], startMs: -1 }],
        }),
      ),
    ).toThrow();
  });

  it.each([
    ["control characters", "laptops\nforged"],
    ["excessive length", "a".repeat(181)],
  ])("rejects category slugs containing %s", (_description, categorySlug) => {
    expect(() =>
      parseStorefrontHeroImportConfig(
        JSON.stringify({
          ...validConfig,
          chapters: [{ ...validConfig.chapters[0], categorySlug }],
        }),
      ),
    ).toThrow();
  });

  it.each([
    ["control characters", "Laptop nổi bật\nforged"],
    ["excessive length", "N".repeat(161)],
  ])("rejects chapter labels containing %s", (_description, label) => {
    expect(() =>
      parseStorefrontHeroImportConfig(
        JSON.stringify({
          ...validConfig,
          chapters: [{ ...validConfig.chapters[0], label }],
        }),
      ),
    ).toThrow();
  });

  it("rejects more than 32 chapters", () => {
    const chapters = Array.from({ length: 33 }, (_, sortOrder) => ({
      ...validConfig.chapters[0],
      categorySlug: `category-${sortOrder}`,
      sortOrder,
    }));

    expect(() =>
      parseStorefrontHeroImportConfig(JSON.stringify({ ...validConfig, chapters })),
    ).toThrow();
  });

  it.each([
    ["control characters", "nova-signal\nstatus=forged"],
    ["excessive length", "a".repeat(65)],
  ])("rejects presentation codes containing %s", (_description, code) => {
    expect(() =>
      parseStorefrontHeroImportConfig(JSON.stringify({ ...validConfig, code })),
    ).toThrow();
  });

  it.each([
    ["absolute source paths", { ...validConfig, filePath: "/imports/hero.mp4" }],
    ["MinIO object paths", { ...validConfig, objectKey: "storefront/hero/hero.mp4" }],
  ])("keeps %s out of database configuration", (_description, config) => {
    expect(() => parseStorefrontHeroImportConfig(JSON.stringify(config))).toThrow();
  });
});

describe("Storefront hero disable arguments", () => {
  it("accepts exactly one non-empty presentation code", () => {
    expect(parseStorefrontHeroDisableArguments(["--code", "nova-signal"])).toBe(
      "nova-signal",
    );
  });

  it.each([
    { arguments_: [] },
    { arguments_: ["--code", ""] },
    { arguments_: ["--code", "   "] },
    { arguments_: ["--code", "nova-signal", "--code", "other"] },
    { arguments_: ["--code", "nova-signal", "--force"] },
  ])("rejects invalid arguments $arguments_", ({ arguments_ }) => {
    expect(() => parseStorefrontHeroDisableArguments(arguments_)).toThrow(
      "Expected exactly --code <non-empty-code>",
    );
  });

  it.each([
    ["control characters", "nova-signal\nstatus=forged"],
    ["excessive length", "a".repeat(65)],
  ])("rejects codes containing %s", (_description, code) => {
    expect(() => parseStorefrontHeroDisableArguments(["--code", code])).toThrow(
      "Expected exactly --code <non-empty-code>",
    );
  });
});
