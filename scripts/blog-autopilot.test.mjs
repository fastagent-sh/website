import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  callModel,
  extractMarkdownBody,
  generatePost,
  resolveModelConfig,
  selectTopic,
  serializePost,
  splitPost,
  validateBody,
  validatePlan,
} from "./blog-autopilot.mjs";

function topic(overrides = {}) {
  return {
    slug: "next-post",
    due: "2026-09-01",
    status: "planned",
    title: "Next post",
    description: "A useful post.",
    tags: ["tutorial"],
    audience: "Developers",
    outcome: "A working result",
    sourceFiles: ["README.md"],
    officialLinks: ["https://example.com/docs"],
    requiredTerms: ["createPiAgentFromDir"],
    requiredSections: ["First section", "When not to use this shape"],
    boundaries: ["No exactly-once guarantee."],
    wordRange: [12, 120],
    ...overrides,
  };
}

function plan(topics = [topic()]) {
  return { version: 1, cadenceDays: 14, publicationMode: "pull-request", language: "en", topics };
}

const validBody = `## First section

Use \`createPiAgentFromDir\` to build the agent. Read the [official guide](https://example.com/docs) before deployment.

## When not to use this shape

There is no exactly-once guarantee. Use another system when deterministic recovery is required.
`;

test("selectTopic returns only due planned topics and supports an explicit future topic", () => {
  const future = topic({ slug: "future", due: "2026-10-01" });
  const selected = selectTopic(plan([topic(), future]), { today: "2026-09-02", existingSlugs: new Set() });
  assert.equal(selected.slug, "next-post");
  assert.equal(
    selectTopic(plan([future]), { topicSlug: "future", today: "2026-09-02", existingSlugs: new Set() }).slug,
    "future",
  );
  assert.equal(selectTopic(plan([future]), { today: "2026-09-02", existingSlugs: new Set() }), undefined);
});

test("selectTopic refuses an existing post and validatePlan catches duplicate slugs", () => {
  assert.throws(
    () => selectTopic(plan(), { topicSlug: "next-post", today: "2026-09-02", existingSlugs: new Set(["next-post"]) }),
    /already exists/,
  );
  assert.throws(() => validatePlan(plan([topic(), topic()])), /duplicate topic slug/);
});

test("extractMarkdownBody removes wrappers, frontmatter, and a duplicate H1", () => {
  const raw = `\`\`\`markdown
---
title: ignored
---
# Next post

${validBody}\`\`\``;
  const body = extractMarkdownBody(raw, "Next post");
  assert.ok(body.startsWith("## First section"));
  assert.doesNotMatch(body, /^# /m);
  assert.doesNotMatch(body, /^---$/m);
});

test("validateBody enforces structure and permits an explicitly negated exactly-once statement", () => {
  const valid = validateBody(validBody, topic(), { sourceText: "createPiAgentFromDir" });
  assert.deepEqual(valid.issues, []);
  const invalid = validateBody(
    validBody.replace("There is no exactly-once guarantee.", "This provides exactly-once execution."),
    topic(),
    { sourceText: "createPiAgentFromDir" },
  );
  assert.ok(invalid.issues.some((issue) => issue.includes("unqualified exactly-once")));
});

test("validateBody catches removed APIs, missing official links, and unknown commands", () => {
  const body = validBody
    .replace("createPiAgentFromDir", "createPiAgentFromWorkspace")
    .replace("https://example.com/docs", "https://elsewhere.example")
    .replace("Use `createPiAgentFromWorkspace`", "fastagent magic deploy");
  const result = validateBody(body, topic(), { sourceText: "fastagent dev" });
  assert.ok(result.issues.some((issue) => issue.includes("missing required term")));
  assert.ok(result.issues.some((issue) => issue.includes("missing official link")));
  assert.ok(result.issues.some((issue) => issue.includes("not discoverable")));
});

test("serializePost produces schema-compatible frontmatter and splitPost returns the body", () => {
  const post = serializePost(topic(), validBody, "2026-09-02");
  assert.match(post, /^---\ntitle: "Next post"\ndate: 2026-09-02\ndescription:/);
  assert.match(post, /tags:\n  - tutorial/);
  assert.equal(splitPost(post).body.trim(), validBody.trim());
});

test("resolveModelConfig infers provider-specific keys and requires an explicit model", () => {
  const config = resolveModelConfig({ ANTHROPIC_API_KEY: "secret", BLOG_AUTOPILOT_MODEL: "model-a" });
  assert.equal(config.provider, "anthropic");
  assert.equal(config.model, "model-a");
  assert.throws(() => resolveModelConfig({ ANTHROPIC_API_KEY: "secret" }), /no model configured/);
  assert.throws(
    () =>
      resolveModelConfig({
        BLOG_AUTOPILOT_PROVIDER: "compatible",
        BLOG_AUTOPILOT_API_KEY: "secret",
        BLOG_AUTOPILOT_MODEL: "model-a",
        BLOG_AUTOPILOT_BASE_URL: "http://models.example/v1/chat/completions",
      }),
    /must use HTTPS/,
  );
});

test("callModel supports Anthropic and OpenAI-compatible response shapes", async () => {
  const requests = [];
  const fakeFetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(
      JSON.stringify(
        requests.length === 1
          ? { content: [{ type: "text", text: validBody }] }
          : { choices: [{ message: { content: validBody } }] },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const prompt = { system: "system", user: "user" };
  assert.equal(
    await callModel(
      { provider: "anthropic", apiKey: "a", model: "m", maxTokens: 4000, endpoint: "https://anthropic.invalid" },
      prompt,
      fakeFetch,
    ),
    validBody,
  );
  assert.equal(
    await callModel(
      { provider: "openai", apiKey: "b", model: "m", maxTokens: 4000, endpoint: "https://openai.invalid" },
      prompt,
      fakeFetch,
    ),
    validBody,
  );
  assert.equal(requests[0].options.headers["x-api-key"], "a");
  assert.equal(requests[1].options.headers.authorization, "Bearer b");
});

test("generatePost performs draft plus review, writes one post, and advances plan state", async () => {
  const root = await mkdtemp(join(tmpdir(), "fastagent-blog-autopilot-"));
  const productDir = join(root, "product");
  const blogDir = join(root, "blog");
  const planPath = join(root, "plan.json");
  await mkdir(productDir);
  await mkdir(blogDir);
  await writeFile(join(productDir, "package.json"), JSON.stringify({ version: "9.8.7" }));
  await writeFile(join(productDir, "README.md"), "createPiAgentFromDir is shipped.\n");
  await writeFile(
    join(blogDir, "existing.md"),
    `---\ntitle: Existing\ndate: 2026-01-01\ndescription: Existing post.\ntags: []\n---\n\n## Existing section\n`,
  );
  await writeFile(planPath, `${JSON.stringify(plan(), null, 2)}\n`);
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({ content: [{ type: "text", text: validBody }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await generatePost({
    planPath,
    blogDir,
    productDir,
    topicSlug: "next-post",
    today: "2026-09-02",
    env: { BLOG_AUTOPILOT_PROVIDER: "anthropic", BLOG_AUTOPILOT_API_KEY: "secret", BLOG_AUTOPILOT_MODEL: "model-a" },
    fetchImpl,
  });
  assert.equal(calls, 2);
  assert.equal(result.generated, true);
  assert.equal(result.productVersion, "9.8.7");
  const generated = await readFile(join(blogDir, "next-post.md"), "utf8");
  assert.match(generated, /date: 2026-09-02/);
  assert.match(generated, /## First section/);
  const updated = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(updated.topics[0].status, "generated");
  assert.equal(updated.topics[0].productVersion, "9.8.7");
});
