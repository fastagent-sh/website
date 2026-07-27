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
    /* The pattern is flat on purpose, and not only because the posts are.
       Nimbus reads this file as text to learn which collections exist, and
       its comment stripper cannot tell a comment opener from one inside a
       string: the two characters in a "**\/*.md" pattern open a comment that
       swallows the file up to the next real close, the parse returns nothing,
       and the build quietly indexes docs alone — no /blog/llms.txt, no post
       twins, half a corpus. The postbuild link check is what catches it. */
    loader: glob({ base: "./src/content/blog", pattern: "*.md" }),
    schema: z.object({
      title: z.string(),
      date: z.coerce.date(),
      /* description, not excerpt: this is the one field the framework indexer
         reads, so it is what puts a post line in /blog/llms.txt and in the
         markdown twin frontmatter. The page and the feed read it too. */
      description: z.string(),
      tags: z.array(z.string().regex(/^[a-z0-9-]+$/, "tags must be url-safe slugs")).default([]),
    }),
  }),
};
