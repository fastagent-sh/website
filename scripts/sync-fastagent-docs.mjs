import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("../", import.meta.url);
const source = new URL("vendor/fastagent/", root);
const sourceDocs = new URL("docs/", source);
const generatedDocs = new URL("src/content/docs/docs/", root);
const generated = new URL("src/generated/", root);
const publicDir = new URL("public/", root);

const pkg = JSON.parse(await readFile(new URL("package.json", source), "utf8"));
if (pkg.name !== "@fastagent-sh/fastagent") {
  throw new Error("vendor/fastagent is not the FastAgent repository");
}

const files = await markdownFiles(sourceDocs);
if (files.length < 10 || !files.includes("README.md") || !files.includes("ai-start.md")) {
  throw new Error("vendor/fastagent/docs is incomplete; initialize or update the submodule");
}

await rm(generatedDocs, { recursive: true, force: true });
await mkdir(generatedDocs, { recursive: true });

for (const relative of files) {
  const output = relative
    .split(path.sep)
    .map((segment) => (segment === "README.md" ? "index.md" : segment))
    .join(path.sep);
  const destination = new URL(output, generatedDocs);
  let markdown = await readFile(new URL(relative, sourceDocs), "utf8");
  markdown = markdown
    .replaceAll("README.md", "index.md")
    .replaceAll("](../CONTRIBUTING.md)", "](https://github.com/fastagent-sh/fastagent/blob/main/CONTRIBUTING.md)");
  markdown = rewriteDocLinks(markdown, output);
  markdown = addFrontmatter(markdown, relative).replace(/^# .+\n+/m, "");
  await mkdir(new URL("./", destination), { recursive: true });
  await writeFile(destination, markdown);
}

await mkdir(publicDir, { recursive: true });
const start = rewriteDocLinks(await readFile(new URL("ai-start.md", sourceDocs), "utf8"), "ai-start.md").replaceAll(
  "](/docs/",
  "](https://fastagent.sh/docs/",
);
await writeFile(new URL("start.md", publicDir), start);

/* Agent Skills discovery (cloudflare/agent-skills-discovery-rfc v0.2.0): republish the
   ai-start guide as a SKILL.md plus a digest index under /.well-known/agent-skills/. */
const descLine = start.match(/^description: (.+)$/m)?.[1];
if (!descLine) throw new Error("ai-start.md has no frontmatter description");
const skillMd = start.replace(/^---\n[\s\S]*?\n---\n/, `---\nname: fastagent\ndescription: ${descLine}\n---\n`);
const skillDir = new URL(".well-known/agent-skills/fastagent/", publicDir);
await mkdir(skillDir, { recursive: true });
await writeFile(new URL("SKILL.md", skillDir), skillMd);
const index = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "fastagent",
      type: "skill-md",
      description: JSON.parse(descLine),
      url: "/.well-known/agent-skills/fastagent/SKILL.md",
      digest: `sha256:${createHash("sha256").update(skillMd).digest("hex")}`,
    },
  ],
};
await writeFile(new URL(".well-known/agent-skills/index.json", publicDir), `${JSON.stringify(index, null, 2)}\n`);

const commit = execFileSync("git", ["-C", new URL(source).pathname, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
await mkdir(generated, { recursive: true });
await writeFile(
  new URL("fastagent.json", generated),
  `${JSON.stringify({ version: pkg.version, commit }, null, 2)}\n`,
);

async function markdownFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...(await markdownFiles(new URL(`${entry.name}/`, directory), relative)));
    else if (entry.isFile() && entry.name.endsWith(".md")) found.push(relative);
  }
  return found.sort();
}

function rewriteDocLinks(markdown, currentFile) {
  return markdown.replace(/\]\((?!https?:|mailto:|#|\/)([^)\s]+\.md)(#[^)]+)?\)/g, (_match, target, hash = "") => {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(currentFile), target));
    if (resolved.startsWith("../")) throw new Error(`doc link escapes docs: ${currentFile} -> ${target}`);
    const route = resolved.replace(/\.md$/, "").replace(/(^|\/)index$/, "").toLowerCase();
    return `](/docs/${route ? `${route}/` : ""}${hash})`;
  });
}

function addFrontmatter(markdown, relative) {
  const editUrl = `https://github.com/fastagent-sh/fastagent/edit/main/docs/${relative}`;
  if (markdown.startsWith("---\n")) return markdown.replace("---\n", `---\neditUrl: ${editUrl}\n`);
  const title = markdown.match(/^# (.+)$/m)?.[1];
  if (!title) throw new Error(`docs/${relative} has no frontmatter title or H1`);
  return `---\ntitle: ${JSON.stringify(title)}\neditUrl: ${editUrl}\n---\n\n${markdown}`;
}
