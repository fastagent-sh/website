// Root /llms.txt — sectioned index for AI agents.
import { getIndexedTopLevel } from "@cloudflare/nimbus-docs";
import { config } from "virtual:nimbus/config";

import fastagent from "../generated/fastagent.json";
import { DETAILS, SECTIONS } from "../site";

export const prerender = true;

export async function GET() {
  const { leaves, groups } = await getIndexedTopLevel();

  const lines = [
    `# ${config.title}`,
    "",
    config.description ?? "Documentation index for AI agents.",
    "",
    DETAILS,
    "",
    `Documentation for FastAgent v${fastagent.version} (source commit ${fastagent.commit}).`,
    "",
    `Full corpus (all pages, one document): ${new URL("/llms-full.txt", config.site).href}`,
    "",
    "## Sections",
    "",
  ];

  // Sort leaves + groups alphabetically into a single stable list.
  type Row = { key: string; line: string };
  const rows: Row[] = [];

  for (const leaf of leaves) {
    const description = leaf.description ? ` — ${leaf.description}` : "";
    rows.push({
      key: leaf.url,
      line: `- [${leaf.title}](${new URL(leaf.markdownUrl, config.site).href})${description}`,
    });
  }

  for (const group of groups) {
    // Older doc versions have their own /<v>/llms.txt; don't list them here.
    // Hidden ones get no index file at all (see [section]/llms.txt.ts), so
    // linking one would be a promise the build doesn't keep.
    if (group.kind === "version" || group.hidden) continue;
    rows.push({
      key: `/${group.slug}`,
      line: `- [${SECTIONS[group.slug]?.label ?? group.label}](${new URL(`/${group.slug}/llms.txt`, config.site).href})${SECTIONS[group.slug] ? ` — ${SECTIONS[group.slug].description}` : ""}`,
    });
  }

  /* Alphabetical, except the primary section leads: read top-down, an agent
     should meet the documentation before the blog. */
  rows.sort((a, b) => (a.key === "/docs" ? "" : a.key).localeCompare(b.key === "/docs" ? "" : b.key));
  for (const row of rows) lines.push(row.line);

  /* Match the docs' starting path; titles follow the synced entries. */
  const members = new Map(groups.flatMap((g) => g.members.map((m) => [m.entry.id, m])));
  const start = ["docs", "docs/ai-start", "docs/quickstart", "docs/overview", "docs/configuration"].map((id) => {
    const item = members.get(id);
    // Renamed upstream: fail the build rather than quietly drop the promotion.
    if (!item) throw new Error(`llms.txt promotes "${id}", which is not a page`);
    return item;
  });
  lines.push(
    "",
    "## Start here",
    "",
    ...start.map((item) => `- [${item.title}](${new URL(item.markdownUrl, config.site).href})`),
  );

  /* The authoring guide also ships outside the docs routes, as Markdown and a skill. */
  lines.push(
    "",
    "## For coding agents",
    "",
    `- [Agent development guide](${new URL("/start.md", config.site).href}) — responsibilities, TypeScript tools, verification, channels, scheduling, and deployment.`,
    `- [Agent skill](${new URL("/.well-known/agent-skills/fastagent/SKILL.md", config.site).href}) — the same guide as an installable skill.`,
    `- [Source](https://github.com/fastagent-sh/fastagent) · [npm](https://www.npmjs.com/package/@fastagent-sh/fastagent)`,
  );

  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
