// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const MAXIMUM_PRESENTATION_CODE_LENGTH = 64;
const MAXIMUM_CATEGORY_SLUG_LENGTH = 180;
const MAXIMUM_CHAPTER_LABEL_LENGTH = 160;
const MAXIMUM_STOREFRONT_HERO_CHAPTERS = 32;
const ASCII_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

const asciiSlugSchema = (maximumLength: number) =>
  z.string().min(1).max(maximumLength).regex(ASCII_SLUG_PATTERN);

const presentationCodeSchema = asciiSlugSchema(MAXIMUM_PRESENTATION_CODE_LENGTH);
const categorySlugSchema = asciiSlugSchema(MAXIMUM_CATEGORY_SLUG_LENGTH);
const chapterLabelSchema = z
  .string()
  .min(1)
  .max(MAXIMUM_CHAPTER_LABEL_LENGTH)
  .refine((value) => value.trim().length > 0)
  .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value));

const chapterSchema = z
  .object({
    categorySlug: categorySlugSchema,
    sortOrder: z.number().int().nonnegative().safe(),
    startMs: z.number().int().nonnegative().safe(),
    endMs: z.number().int().positive().safe(),
    label: chapterLabelSchema,
  })
  .strict();

const importConfigSchema = z
  .object({
    code: presentationCodeSchema,
    chapters: z.array(chapterSchema).min(1).max(MAXIMUM_STOREFRONT_HERO_CHAPTERS),
  })
  .strict();

export type StorefrontHeroImportConfig = z.infer<typeof importConfigSchema>;

export interface StorefrontHeroImportArguments {
  readonly filePath: string;
  readonly configPath: string;
}

export function parseStorefrontHeroImportArguments(
  arguments_: readonly string[],
): StorefrontHeroImportArguments {
  if (arguments_.length !== 4) throw invalidImportArguments();

  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (
      (flag !== "--file" && flag !== "--config") ||
      value === undefined ||
      value.trim().length === 0 ||
      value.startsWith("--") ||
      values.has(flag)
    ) {
      throw invalidImportArguments();
    }
    values.set(flag, value);
  }

  const filePath = values.get("--file");
  const configPath = values.get("--config");
  if (filePath === undefined || configPath === undefined) throw invalidImportArguments();
  return { filePath, configPath };
}

export function parseStorefrontHeroImportConfig(raw: string): StorefrontHeroImportConfig {
  return importConfigSchema.parse(JSON.parse(raw) as unknown);
}

export function parseStorefrontHeroDisableArguments(arguments_: readonly string[]): string {
  if (arguments_.length !== 2 || arguments_[0] !== "--code") {
    throw invalidDisableArguments();
  }
  const parsedCode = presentationCodeSchema.safeParse(arguments_[1]);
  if (!parsedCode.success) throw invalidDisableArguments();
  return parsedCode.data;
}

function invalidImportArguments(): Error {
  return new Error("Expected exactly --file <path> and --config <path>");
}

function invalidDisableArguments(): Error {
  return new Error("Expected exactly --code <non-empty-code>");
}
