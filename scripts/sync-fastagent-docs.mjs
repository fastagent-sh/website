import { execFileSync } from "node:child_process";
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
