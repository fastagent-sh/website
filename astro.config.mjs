// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightBlog from "starlight-blog";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";

const site = "https://fastagent.sh";
const description =
  "An agent is just a directory — FastAgent serves it as a live service on GitHub, Telegram, or any channel you compose. No rewrite, no new format, no platform.";

export default defineConfig({
  site,
  output: "static",
  integrations: [
    starlight({
      title: "FastAgent",
      description,
      favicon: "/favicon.png",
      logo: {
        light: "./src/assets/logo-light.png",
        dark: "./src/assets/logo.png",
        replacesTitle: true,
      },
      customCss: ["./src/styles/custom.css"],
      head: [
        { tag: "link", attrs: { rel: "preload", href: "/fonts/plex-mono-400.woff2", as: "font", type: "font/woff2", crossorigin: "anonymous" } },
        { tag: "link", attrs: { rel: "preload", href: "/fonts/plex-mono-600.woff2", as: "font", type: "font/woff2", crossorigin: "anonymous" } },
        { tag: "meta", attrs: { property: "og:image", content: `${site}/social-preview.png` } },
        { tag: "meta", attrs: { property: "og:image:alt", content: "FastAgent — Vibe first. Then FastAgent." } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "link", attrs: { rel: "alternate", type: "application/rss+xml", href: `${site}/blog/rss.xml`, title: "FastAgent Blog" } },
      ],
      plugins: [
        starlightBlog({
          title: "FastAgent Blog",
          authors: {
            fastagent: { name: "The FastAgent team", url: "https://github.com/fastagent-sh" },
          },
        }),
        starlightLlmsTxt({
          projectName: "FastAgent",
          description,
          details: "FastAgent is engine-, model-, and host-neutral. The included reference implementation is built on pi.",
          optionalLinks: [
            { label: "AI-guided start", url: `${site}/start.md`, description: "Instructions for coding agents serving an existing agent definition." },
            { label: "GitHub", url: "https://github.com/fastagent-sh/fastagent" },
            { label: "npm", url: "https://www.npmjs.com/package/@fastagent-sh/fastagent" },
          ],
          customSets: [
            { label: "Core documentation", paths: ["docs", "docs/**"], description: "FastAgent guides and reference documentation." },
          ],
          promote: ["docs", "docs/quickstart", "docs/ai-start", "docs/configuration", "docs/overview"],
          demote: ["blog/**", "docs/design/**"],
          exclude: ["blog/**", "docs/design/**"],
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
