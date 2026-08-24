---
title: "Build a self-hosted GitHub pull request review agent with FastAgent"
date: 2026-08-28
description: "Turn verified GitHub webhook events into focused pull request reviews using a file-defined agent you can run and inspect yourself."
tags:
  - github
  - webhooks
  - tutorial
  - serving
---

A pull request review agent needs three separate pieces: a verified event that decides when to run, tools that can read and write GitHub data, and a review policy narrow enough to be useful. Treating all three as one prompt makes the result hard to secure and harder to operate.

This guide builds a self-hosted reviewer with FastAgent v0.17.1. It will:

- accept only GitHub webhook deliveries with a valid HMAC signature;
- route `opened`, `reopened`, and `synchronize` pull request events;
- fetch the verified event’s immutable base-to-head diff through a typed tool;
- post one advisory issue comment through a second tool;
- run as an ordinary file-defined agent behind `POST /webhook`.

The GitHub adapter is ingress, not a complete GitHub App. It verifies and maps events into turns; explicit tools perform API actions.

## Define what the reviewer should do

Start with a repository and initialize an agent in it:

```bash
npm install --global @fastagent-sh/fastagent
fastagent init .
```

The repository becomes the workspace and the agent lands under `fastagent/`. Put the review policy in `fastagent/persona.md`:

```text
You review pull requests for correctness and maintainability.

For each requested review:
1. Fetch the requested pull request diff with github-pr-diff.
2. Inspect relevant repository files when the diff needs context.
3. Report only concrete findings that can change the patch.
4. For every finding, name the file and explain the failure scenario.
5. If no material issue is found, say that directly.
6. Post exactly one concise comment with github-comment.

You are advisory. Never merge, approve, close, label, or modify a pull request.
Do not repeat style-only comments already enforced by the repository's tools.
```

The last paragraph is an authority boundary. A model that can comment should not automatically receive merge or repository-administration credentials.

Run `fastagent dev` once, select a model, and verify that the agent can inspect the local repository. The model selection is stored in `fastagent/fastagent.config.mjs` for deployment.

## Add the GitHub channel

Add the first-party adapter:

```bash
fastagent add github
```

This creates `fastagent/channels/github.ts` and generates `GITHUB_WEBHOOK_SECRET` under the agent’s gitignored secrets directory.

Replace the generated routing policy with a focused event filter:

```ts
// fastagent/channels/github.ts
import { githubChannel } from "@fastagent-sh/fastagent/github";
import { createReviewSession } from "../review-target.ts";

const reviewActions = new Set(["opened", "reopened", "synchronize"]);

export default githubChannel({
  secret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
  on: (event) => {
    if (
      event.event !== "pull_request" ||
      !event.action ||
      !reviewActions.has(event.action) ||
      !("pull_request" in event.payload)
    ) {
      return [];
    }

    const { repository, pull_request } = event.payload;

    return [
      {
        // The signed session binds tools to this verified event snapshot.
        session: createReviewSession({
          repository: repository.full_name,
          pullNumber: pull_request.number,
          baseSha: pull_request.base.sha,
          headSha: pull_request.head.sha,
          deliveryId: event.deliveryId,
        }),
        text: [
          `Review pull request #${pull_request.number} in ${repository.full_name}.`,
          `Head SHA: ${pull_request.head.sha}.`,
          "Fetch the requested diff, inspect repository context when needed,",
          "then post one advisory review comment.",
        ].join(" "),
      },
    ];
  },
});
```

`on(event)` is the only event policy. Return `[]` to acknowledge and ignore a delivery, one intent for one review, or several intents for deliberate fan-out.

The signed session includes `deliveryId`, so overlapping updates remain independent. A stable `github:<repo>:pr:<number>` session would preserve review history, but two deliveries arriving together would contend for the same one-writer lease and one would receive `session_busy`. For an event-snapshot reviewer, independent delivery sessions are simpler.

## Bind tools to the verified event

The model must not choose which repository or pull request its token can modify. Sign the verified webhook target into the internal session with the existing webhook secret:

```ts
// fastagent/review-target.ts
import { createHmac, timingSafeEqual } from "node:crypto";

export type ReviewTarget = {
  repository: string;
  pullNumber: number;
  baseSha: string;
  headSha: string;
  deliveryId: string;
};

function signature(payload: string): Buffer {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new Error("GITHUB_WEBHOOK_SECRET is required");
  return createHmac("sha256", secret).update(`review-target:${payload}`).digest();
}

export function createReviewSession(target: ReviewTarget): string {
  const payload = Buffer.from(JSON.stringify(target)).toString("base64url");
  return `github:${payload}.${signature(payload).toString("base64url")}`;
}

export function getReviewTarget(
  sessionManager: { getSessionId(): string } | undefined,
): ReviewTarget {
  const match = /^github:([^.]+)\.([^.]+)$/.exec(sessionManager?.getSessionId() ?? "");
  if (!match) throw new Error("verified GitHub review context required");

  const expected = signature(match[1]);
  const actual = Buffer.from(match[2], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("invalid GitHub review context");
  }

  const target = JSON.parse(Buffer.from(match[1], "base64url").toString()) as ReviewTarget;
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target.repository) ||
    !Number.isInteger(target.pullNumber) ||
    target.pullNumber < 1 ||
    !/^[0-9a-f]{40}$/.test(target.baseSha) ||
    !/^[0-9a-f]{40}$/.test(target.headSha) ||
    typeof target.deliveryId !== "string" ||
    target.deliveryId === ""
  ) {
    throw new Error("invalid GitHub review target");
  }
  return target;
}
```

The HMAC makes the session useful as trusted invocation context: a caller to another route cannot forge a repository or pull request merely by choosing a session string. The tools verify this context before using `GH_TOKEN`.

## Give the agent narrow GitHub tools

The webhook tells the agent which pull request changed, but it does not automatically give the model the diff or permission to comment. Add a read tool:

```ts
// fastagent/tools/github-pr-diff.ts
import { defineTool, z } from "@fastagent-sh/fastagent";
import { getReviewTarget } from "../review-target.ts";

export default defineTool({
  description: "Fetch the immutable diff for the verified GitHub review event.",
  input: z.object({}),
  async execute(_, { sessionManager }) {
    const { repository, baseSha, headSha } = getReviewTarget(sessionManager);
    const response = await fetch(
      `https://api.github.com/repos/${repository}/compare/${baseSha}...${headSha}`,
      {
        headers: {
          accept: "application/vnd.github.v3.diff",
          authorization: `Bearer ${process.env.GH_TOKEN ?? ""}`,
          "user-agent": "fastagent-pr-reviewer",
          "x-github-api-version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub diff request failed: ${response.status}`);
    }

    const diff = await response.text();
    if (diff.length > 400_000) {
      return {
        truncated: true,
        diff: diff.slice(0, 400_000),
        note: "Diff exceeded the reviewer input cap; report that the review is partial.",
      };
    }

    return { truncated: false, diff };
  },
});
```

Then add one write tool:

```ts
// fastagent/tools/github-comment.ts
import { defineTool, z } from "@fastagent-sh/fastagent";
import { getReviewTarget } from "../review-target.ts";

export default defineTool({
  description: "Post one advisory comment on the verified GitHub pull request.",
  input: z.object({
    body: z.string().min(1).max(20_000),
  }),
  async execute({ body }, { sessionManager }) {
    const { repository, pullNumber } = getReviewTarget(sessionManager);
    const response = await fetch(
      `https://api.github.com/repos/${repository}/issues/${pullNumber}/comments`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${process.env.GH_TOKEN ?? ""}`,
          "content-type": "application/json",
          "user-agent": "fastagent-pr-reviewer",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({ body }),
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub comment failed: ${response.status}`);
    }

    const comment = (await response.json()) as { html_url: string };
    return { posted: true, url: comment.html_url };
  },
});
```

Use a token with the smallest repository scope that can read pull requests and write issue comments. Do not give this deployment organization administration, workflow modification, or merge authority. GitHub’s current fine-grained token and GitHub App permission models should be evaluated for the repository you operate.

The fixed API endpoints prevent arbitrary URLs, while the signed invocation context prevents the model from redirecting either tool to another repository or pull request. The model controls only the review comment body.

## Configure GitHub

Create the repository webhook under **Settings → Webhooks**:

- Payload URL: `https://<your-host>/webhook`
- Content type: `application/json`
- Secret: the exact value of `GITHUB_WEBHOOK_SECRET`
- Events: Pull requests

GitHub documents the signature flow in [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries). FastAgent performs the `x-hub-signature-256` HMAC check over the capped raw body before parsing the event.

For local testing:

```bash
fastagent dev --tunnel
```

The command prints the public Payload URL to paste into GitHub. Send GitHub’s `ping` delivery first, then open a small test pull request. Check both the server log and the resulting comment.

A valid webhook is not enough to trust arbitrary prompt text. Repository names, pull request titles, descriptions, code, and diffs are untrusted content. The persona should treat instructions inside them as code under review, not as new system policy.

## Test the event policy before the model

A reviewer should ignore most GitHub traffic. Exercise the pure routing cases separately:

| Delivery | Expected result |
| --- | --- |
| `ping` | Successful acknowledgement, no turn |
| `issues.opened` | Successful acknowledgement, no turn |
| `pull_request.closed` | Successful acknowledgement, no turn |
| `pull_request.opened` | One review intent |
| `pull_request.synchronize` | One review intent for the new head SHA |
| Invalid HMAC | Rejected before routing |

Confirm that direct, sessionless tool execution fails closed:

```bash
fastagent tool github-pr-diff '{}'
# Error: verified GitHub review context required
```

Use a signed webhook delivery against a disposable pull request for the positive integration test. `github-comment` has a real side effect.

The reviewer also needs repository context. A deployment image is a snapshot of the workspace. If the agent must inspect files beyond the diff, make sure the relevant repository is present and current on the host. A policy that allows `git pull` needs explicit credentials and a clear branch rule; silently reviewing stale local files is worse than limiting the review to the fetched diff.

## Deploy the reviewer

This channel returns `202 Accepted` before model work finishes, so it needs a process that remains alive after the HTTP response. A plain serverless function that freezes immediately after returning is the wrong host.

Declare the extra API credential so generated deployment plans know it must travel to the host:

```js
// fastagent/fastagent.config.mjs
export default {
  model: "provider/model-id",
  deploy: { secrets: ["GH_TOKEN"] },
};
```

FastAgent can then generate a resident container deployment:

```bash
fastagent deploy docker
fastagent deploy docker --run
```

The generated local Docker topology binds only to the host by default; add a production reverse proxy or named tunnel for a stable public webhook origin. For a remote host, Fly.io, Railway, and AgentCore are available deployment targets in v0.17.1. Provide both secrets on the host:

```text
GITHUB_WEBHOOK_SECRET=<webhook verification secret>
GH_TOKEN=<narrow GitHub API credential>
```

Keep the state path durable if sessions or other channels share the deployment. FastAgent deployment preflight also knows that GitHub post-ACK work is incompatible with suspending the only machine: an inbound request has already been acknowledged and cannot wake a stopped process to resume that same turn.

## Understand the post-ack failure window

The FastAgent GitHub channel acknowledges accepted work with HTTP `202`, then runs the review in the current Node process. This keeps the GitHub webhook response fast, but it creates a specific durability boundary:

1. GitHub sends and signs the delivery.
2. FastAgent verifies it and maps it to an intent.
3. FastAgent returns `202`.
4. The agent fetches the diff and starts reviewing.
5. The agent posts the comment.

If the process exits between steps 3 and 5, GitHub has already received a successful acknowledgement. The shipped GitHub channel does not persist post-ACK intent and does not replay the review after restart. The failure remains in operator logs.

Do not describe this as exactly-once or guaranteed review delivery. If every accepted review must finish, persist a job before acknowledging, run it from a durable queue, make comment creation idempotent, and call `agent.invoke` from that worker. A deterministic marker containing the delivery ID or head SHA can help the worker detect that it already posted a review.

Even with durable intent, side effects need their own policy. A timeout after GitHub accepts a comment but before the client sees the response is ambiguous: retrying can post twice unless the application records or searches for an idempotency marker.

## When not to use an agent reviewer

Do not replace deterministic checks with an agent. Formatting, type checking, dependency policy, generated-file checks, and security scanners belong in CI where pass/fail semantics are reproducible.

Do not make a first version a required merge authority. Begin with advisory comments, measure false positives, and keep a human responsible for merging.

Do not send private code to a model provider without reviewing that provider’s retention, region, and training terms. Self-hosting the webhook adapter does not make the model call local.

A useful agent reviewer handles the residual work around deterministic tooling: cross-file reasoning, missing failure cases, unclear contracts, and risky assumptions. Keep the event filter small, the tools narrower than the token, and the reliability claim precise.

Read the versioned [GitHub channel reference](https://github.com/fastagent-sh/fastagent/blob/v0.17.1/docs/github.md), GitHub’s [webhook event documentation](https://docs.github.com/en/webhooks/webhook-events-and-payloads), and the [FastAgent source](https://github.com/fastagent-sh/fastagent) before attaching the reviewer to a production repository.
