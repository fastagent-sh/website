// Root /llms.txt — sectioned index for AI agents.
import { getIndexedTopLevel } from "@cloudflare/nimbus-docs";
import { config } from "virtual:nimbus/config";

export const prerender = true;

export async function GET() {
  const { leaves, groups } = await getIndexedTopLevel();

  const lines = [
    `# ${config.title}`,
    "",
    config.description ?? "Documentation index for AI agents.",
    "",
    `Full corpus (all pages, one document): ${new URL("/llms-full.txt", config.site).href}`,
    "",
    "## Pages",
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
    if (group.kind === "version") continue;
    rows.push({
      key: `/${group.slug}`,
      line: `- [${group.label}](${new URL(`/${group.slug}/llms.txt`, config.site).href})`,
    });
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));
  for (const row of rows) lines.push(row.line);

  /* The pages above are the site; these are the two doors into it that are
     not pages. start.md is the runbook a coding agent is pointed at from the
     landing, and the skill is the same text under the discovery well-known
     path — an agent that found this file should not have to guess either. */
  lines.push(
    "",
    "## For coding agents",
    "",
    `- [Build an agent](${new URL("/start.md", config.site).href}) — the guided start: new project, existing files, or embedded in an app.`,
    `- [Agent skill](${new URL("/.well-known/agent-skills/fastagent/SKILL.md", config.site).href}) — the same guide as an installable skill.`,
    `- [Source](https://github.com/fastagent-sh/fastagent) · [npm](https://www.npmjs.com/package/@fastagent-sh/fastagent)`,
  );

  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
