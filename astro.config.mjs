// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";

import { fastagentCode } from "./src/code-theme.ts";
import { DESCRIPTION as description, OG_IMAGE, SITE as site } from "./src/site.ts";



export default defineConfig({
  site,
  output: "static",
  integrations: [
    starlight({
      title: "FastAgent",
      description,
      expressiveCode: {
        themes: ["github-dark", "github-light", fastagentCode],
        themeCssSelector: (theme) =>
          theme.name === "fastagent-dark" ? "[data-theme='fastagent']" : `[data-theme='${theme.type}']`,
      },
      favicon: "/favicon.png",
      logo: {
        light: "./src/assets/logo-light.png",
        dark: "./src/assets/logo.png",
        replacesTitle: true,
        alt: "FastAgent",
      },
      components: {
        Head: "./src/components/StarlightHead.astro",
      },
      customCss: ["./src/styles/custom.css"],
      head: [
        { tag: "link", attrs: { rel: "preload", href: "/fonts/plex-mono-400.woff2", as: "font", type: "font/woff2", crossorigin: "anonymous" } },
        { tag: "link", attrs: { rel: "preload", href: "/fonts/plex-mono-600.woff2", as: "font", type: "font/woff2", crossorigin: "anonymous" } },
        { tag: "meta", attrs: { property: "og:image", content: OG_IMAGE.url } },
        { tag: "meta", attrs: { property: "og:image:width", content: OG_IMAGE.width } },
        { tag: "meta", attrs: { property: "og:image:height", content: OG_IMAGE.height } },
        { tag: "meta", attrs: { property: "og:image:alt", content: OG_IMAGE.alt } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "link", attrs: { rel: "alternate", type: "application/rss+xml", href: `${site}/blog/rss.xml`, title: "FastAgent Blog" } },
      ],
      plugins: [
        starlightLlmsTxt({
          projectName: "FastAgent",
          description,
          details: "FastAgent is harness-, model-, and infra-neutral (the Agent Handler SPEC calls the harness the engine — same seam). The built-in harness is pi.",
          optionalLinks: [
            { label: "AI-guided start", url: `${site}/start.md`, description: "Instructions for coding agents building an agent: new, from existing files, or embedded in an app." },
            { label: "GitHub", url: "https://github.com/fastagent-sh/fastagent" },
            { label: "npm", url: "https://www.npmjs.com/package/@fastagent-sh/fastagent" },
          ],
          customSets: [
            { label: "Core documentation", paths: ["docs", "docs/**"], description: "FastAgent guides and reference documentation." },
          ],
          promote: ["docs", "docs/quickstart", "docs/ai-start", "docs/configuration", "docs/overview"],
          demote: ["docs/design/**"],
          exclude: ["docs/design/**"],
          rawContent: true,
        }),
        starlightLinksValidator(),
      ],
      sidebar: [
        {
          label: "Start here",
          items: ["docs", "docs/overview", "docs/quickstart", { label: "Start with a coding agent", slug: "docs/ai-start" }, "docs/principles"],
        },
        {
          label: "Build an agent",
          items: ["docs/configuration", "docs/embedding"],
        },
        {
          label: "Connect it",
          items: ["docs/channels", "docs/github", "docs/telegram", "docs/slack", "docs/feishu", "docs/channel-development"],
        },
        {
          label: "Run and deploy",
          items: ["docs/deploy"],
        },
        {
          label: "Reference",
          items: ["docs/cli", "docs/api-reference", "docs/troubleshooting", { label: "Agent Handler SPEC", slug: "docs/spec" }],
        },
        {
          label: "Maintainers",
          collapsed: true,
          items: ["docs/design", "docs/design/core", "docs/design/session-control"],
        },
      ],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/fastagent-sh/fastagent" }],
    }),
  ],
});
