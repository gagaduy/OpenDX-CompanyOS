// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const nonEmptyTextSchema = z.string().trim().min(1);
const safeRootRelativePathSchema = z.string().refine(
  (value) => {
    if (value[0] !== "/" || value[1] === "/" || value[1] === "\\") {
      return false;
    }
    return Array.from(value).every((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint > 31 && codePoint !== 127;
    });
  },
  "Expected a safe root-relative path",
);

export const storefrontAssuranceIconKeySchema = z.enum([
  "truck",
  "shield-check",
  "badge-percent",
  "headphones",
]);

export const storefrontContentSchema = z.object({
  assurances: z.array(z.object({
    code: nonEmptyTextSchema,
    iconKey: storefrontAssuranceIconKeySchema,
    title: nonEmptyTextSchema,
    description: nonEmptyTextSchema,
  })),
  metrics: z.array(z.object({
    code: nonEmptyTextSchema,
    displayValue: nonEmptyTextSchema,
    label: nonEmptyTextSchema,
  })),
});

export const storefrontContentEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: storefrontContentSchema,
});

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  sortOrder: z.number(),
});
export const variantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  title: z.string(),
  optionValues: z.record(z.string(), z.string()),
  price: z.object({
    amountMinor: z.number().int().nonnegative(),
    currency: z.literal("VND"),
    previousAmountMinor: z.number().int().positive().optional(),
    discountPercentage: z.number().int().min(1).max(99).optional(),
  }),
  availableQuantity: z.number().int().nonnegative(),
  purchasable: z.boolean(),
});
export const productSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  name: z.string(),
  slug: z.string(),
  brand: z.string().optional(),
  description: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  primaryMedia: z.object({
    id: z.string(),
    altText: z.string(),
    contentUrl: z.string(),
  }),
  variants: z.array(variantSchema),
});
export const heroCategorySchema = categorySchema.pick({
  id: true,
  name: true,
  slug: true,
});
export const heroSlideSchema = z.object({
  category: heroCategorySchema,
  product: productSchema,
});
export const heroChapterSchema = z.object({
  startMs: z.number().int().nonnegative().safe(),
  endMs: z.number().int().positive().safe(),
  label: nonEmptyTextSchema.max(120),
});
export const heroPresentationSlideSchema = heroSlideSchema.extend({
  chapter: heroChapterSchema.optional(),
});
export const heroMediaSchema = z.object({
  id: z.string().uuid(),
  contentUrl: safeRootRelativePathSchema,
  contentType: z.literal("video/mp4"),
  byteSize: z.number().int().positive().safe(),
  durationMs: z.number().int().positive().safe(),
});
export const heroPresentationSchema = z.object({
  media: heroMediaSchema.optional(),
  slides: z.array(heroPresentationSlideSchema),
}).superRefine((presentation, context) => {
  if (presentation.media === undefined) {
    presentation.slides.forEach((slide, index) => {
      if (slide.chapter !== undefined) {
        context.addIssue({
          code: "custom",
          message: "Image fallback slides must not include video chapters",
          path: ["slides", index, "chapter"],
        });
      }
    });
    return;
  }

  let expectedStartMs = 0;
  presentation.slides.forEach((slide, index) => {
    const chapter = slide.chapter;
    if (chapter === undefined) {
      context.addIssue({
        code: "custom",
        message: "Video presentation slides require chapters",
        path: ["slides", index, "chapter"],
      });
      return;
    }
    if (chapter.startMs !== expectedStartMs) {
      context.addIssue({
        code: "custom",
        message: "Video chapters must form a contiguous timeline starting at zero",
        path: ["slides", index, "chapter", "startMs"],
      });
    }
    if (chapter.endMs <= chapter.startMs) {
      context.addIssue({
        code: "custom",
        message: "Video chapters must have a positive duration",
        path: ["slides", index, "chapter", "endMs"],
      });
    }
    expectedStartMs = chapter.endMs;
  });

  if (expectedStartMs !== presentation.media.durationMs) {
    context.addIssue({
      code: "custom",
      message: "Video duration must equal the final chapter end",
      path: ["media", "durationMs"],
    });
  }
});
export const heroSlidesEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.array(heroSlideSchema),
});
export const heroPresentationEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: heroPresentationSchema,
});
export const categoriesEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.array(categorySchema),
});
export const productsEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.array(productSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
});
export const productEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: productSchema,
});
