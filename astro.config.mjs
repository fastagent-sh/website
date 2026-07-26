// @ts-check
import nimbus, { defineConfig as defineNimbusConfig } from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";
import { defineConfig } from "astro/config";
import icon from "astro-icon";
import tailwindcss from "@tailwindcss/vite";

import { CODE_THEME_DARK, CODE_THEME_LIGHT } from "./src/theme.ts";
import { DESCRIPTION as description, OG_IMAGE, SITE as site } from "./src/site.ts";

/* The docs shell is Nimbus (Astro + Tailwind, every visible file in this
   repo); the landing and the blog keep their own shell in Site.astro. Both
   read the palette from src/theme.ts — see src/styles/globals.css. */
const nimbusConfig = defineNimbusConfig({
  site,
  title: "FastAgent",
  description,
  locale: "en",
  github: "https://github.com/fastagent-sh/fastagent",
  /* Docs pages are generated from vendor/fastagent by npm run sync:docs, so
     the edit link has to point at the upstream repo, not at this one. The
     sync script writes it per page as `editUrl`; [...slug].astro prefers it
     over this pattern, which only ever applies to a page authored here. */
  editPattern: "https://github.com/fastagent-sh/website/edit/main/{path}",
  socialImage: "/social-preview.png",
  socialImageAlt: OG_IMAGE.alt,
  head: [
    { tag: "link", attrs: { rel: "preload", href: "/fonts/plex-mono-400.woff2", as: "font", type: "font/woff2", crossorigin: "anonymous" } },
    { tag: "link", attrs: { rel: "preload", href: "/fonts/plex-mono-600.woff2", as: "font", type: "font/woff2", crossorigin: "anonymous" } },
    { tag: "link", attrs: { rel: "alternate", type: "application/rss+xml", href: `${site}/blog/rss.xml`, title: "FastAgent Blog" } },
  ],
  /* The tree under src/content/docs/docs/ is flat — it mirrors the upstream
     docs/ directory, which the sync script copies verbatim so every link in
     it still resolves. The reading order is this list, not the filesystem. */
  sidebar: {
    items: [
      {
        label: "Start here",
        items: ["docs", "docs/overview", "docs/quickstart", { label: "Start with a coding agent", link: "/docs/ai-start/" }, "docs/principles"],
      },
      { label: "Build an agent", items: ["docs/configuration", "docs/embedding"] },
      {
        label: "Connect it",
        items: ["docs/channels", "docs/github", "docs/telegram", "docs/slack", "docs/feishu", "docs/channel-development"],
      },
      { label: "Run and deploy", items: ["docs/deploy"] },
      {
        label: "Reference",
        items: ["docs/cli", "docs/api-reference", "docs/troubleshooting", { label: "Agent Handler SPEC", link: "/docs/spec/" }],
      },
      {
        label: "Maintainers",
        collapsed: true,
        items: ["docs/design", "docs/design/core", "docs/design/session-control"],
      },
    ],
  },
});

export default defineConfig({
  site,
  output: "static",
  vite: { plugins: [tailwindcss()] },
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  markdown: {
    /* Catppuccin in both shells: Nimbus renders the docs fences and Astro
       renders the blog's, and defaultColor:false makes Shiki emit both
       palettes as --shiki-light / --shiki-dark for CSS to pick between. */
    shikiConfig: {
      themes: { light: CODE_THEME_LIGHT, dark: CODE_THEME_DARK },
      defaultColor: false,
    },
  },
  integrations: [
    icon(),
    /* No `rules`: nimbus-docs lint walks .mdx, and these pages are .md —
       upstream prose is full of angle brackets and braces that MDX would read
       as JSX. What the link rule would have caught is checked instead by
       scripts/check-site.mjs, over the same .md files. */
    nimbus(nimbusConfig, {
      markdown: { hastPlugins: [tableScroll()] },
    }),
  ],
});
