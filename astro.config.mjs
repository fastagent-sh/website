// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";

const site = "https://fastagent.sh";
const description =
  "An agent is just a directory — FastAgent serves it as a live service on GitHub, Telegram, or any channel you compose. No rewrite, no new format, no platform.";

/* The landing's terminal palette as a shiki theme — used ONLY on blog pages
   (selected via data-theme="fastagent" on their <html>). Docs keep Starlight's
   stock github-dark/github-light pair. Token classes: src/styles/custom.css. */
const fastagentCode = {
  name: "fastagent-dark",
  type: "dark",
  colors: {
    "editor.background": "#080a09",
    "editor.foreground": "#d5dcd9",
  },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#5f6c68", fontStyle: "italic" } },
    { scope: ["string", "string.quoted", "string.template"], settings: { foreground: "#e0bd68" } },
    { scope: ["constant.numeric", "constant.language", "constant.character", "support.constant"], settings: { foreground: "#7ecf8a" } },
    { scope: ["keyword", "storage.type", "storage.modifier", "keyword.control"], settings: { foreground: "#b795f5" } },
    { scope: ["keyword.operator"], settings: { foreground: "#d5dcd9" } },
    { scope: ["entity.name.function", "support.function"], settings: { foreground: "#2dd4bf" } },
    { scope: ["entity.name.type", "entity.name.class", "support.type", "support.class"], settings: { foreground: "#6aa5f8" } },
    { scope: ["entity.name.tag"], settings: { foreground: "#b795f5" } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: "#6aa5f8" } },
    { scope: ["variable", "variable.parameter", "variable.other"], settings: { foreground: "#d5dcd9" } },
  ],
};

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
      customCss: ["./src/styles/custom.css"],
      head: [
        { tag: "link", attrs: { rel: "preload", href: "/fonts/plex-mono-400.woff2", as: "font", type: "font/woff2", crossorigin: "anonymous" } },
        { tag: "link", attrs: { rel: "preload", href: "/fonts/plex-mono-600.woff2", as: "font", type: "font/woff2", crossorigin: "anonymous" } },
        { tag: "meta", attrs: { property: "og:image", content: `${site}/social-preview.png` } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { property: "og:image:alt", content: "FastAgent — Vibe first. Then FastAgent." } },
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
          items: ["docs/channels", "docs/github", "docs/telegram", "docs/channel-development"],
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
          items: ["docs/design", "docs/design/core"],
        },
      ],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/fastagent-sh/fastagent" }],
    }),
  ],
});
