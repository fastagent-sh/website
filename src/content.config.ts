import { docsCollection } from "@cloudflare/nimbus-docs/content";
import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

export const collections = {
  docs: defineCollection(
    docsCollection({
      /* The docs are copied from vendor/fastagent by npm run sync:docs, which
         adds `editUrl` (the upstream file) and leaves whatever else upstream
         frontmatter carries — `status`, mostly. Declaring editUrl types it for
         the route; strictFrontmatter lets the rest through untouched, so the
         sync stays a copy rather than a rewrite. */
      schemaFields: { editUrl: z.string().optional() },
      strictFrontmatter: false,
    }),
  ),
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
