import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema(),
  }),
  blog: defineCollection({
    loader: glob({ base: "./src/content/blog", pattern: "**/*.md" }),
    schema: z.object({
      title: z.string(),
      date: z.coerce.date(),
      excerpt: z.string(),
      tags: z.array(z.string().regex(/^[a-z0-9-]+$/, "tags must be url-safe slugs")).default([]),
    }),
  }),
};
