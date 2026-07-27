---
title: "You already vibed an agent. Now what?"
date: 2026-07-27
description: Getting an agent directory out of the terminal usually means adopting a framework or moving into a platform. There is a third shape — a serving layer — and this is what it looks like end to end.
tags:
  - serving
  - embedding
featured: false
---

A year ago, building an "AI agent" meant picking a framework, learning its abstractions, and rebuilding your idea inside its world. Today you open a coding agent, describe what you want, and a few minutes later you have a working agent *directory*: a `persona.md`, some `skills/`, a couple of TypeScript `tools/`. It runs. It's genuinely useful.

Then you hit the wall everyone hits: **it only exists in your terminal.**

Real services receive webhooks. They live in the team chat. They review pull requests. They answer API calls from your product, behind your auth, against your database. They wake up at 9am without you. Your directory does none of that — not because it's badly made, but because "run this while I watch" and "serve this while I sleep" are different jobs.

This post is about that second job.

## What "become a service" actually costs

The gap is not one thing. Point at any agent you've vibed and count what's missing:

- an **HTTP surface** that streams tokens instead of blocking for 40 seconds
- **sessions** that survive a restart, so turn 7 remembers turn 3
- **webhook verification** — signatures, replay windows, the boring security part
- **event mapping** — a `pull_request.opened` payload, a group-chat message, a cron tick, all turned into "one agent turn"
- **concurrency rules** — what happens when two messages land in the same conversation at once
- **a deploy story** — a container, a host, somewhere for state to live

Every one of these is solved work. None of it is *your* work. And notice that none of it changes what your agent knows or does — it's all plumbing between the outside world and a function call.

## The three shapes you'll find

Search for how to deploy an agent and you land on three answers.

**Full agent frameworks.** Capable, often open, frequently built on the same model APIs you'd pick anyway. But they're frameworks: they own the routing, the storage layer, the project layout. Using one means rebuilding your agent as *their kind of project*, then running it as a second service beside the app you already have. If the agent **is** your product, that's a fair trade. If the agent is a **feature** of a product you already ship, you now maintain two frameworks and a network hop between them.

**Vertically integrated platforms.** One click, batteries included, genuinely fast to first response. The cost is the shape of the exit: your agent's runtime, storage, and deployment are the platform's. Great when you're all in on that cloud. A dead end when you're not.

**Vendor agent SDKs.** The shortest path if you've already committed to one model vendor, because the SDK and the hosting are the same product. The lock-in is at the engine, which is exactly the layer most likely to change under you in the next twelve months.

All three answer the question "where should my agent live?" — and all three answer it with *somewhere else.*

## The fourth shape: a serving layer

There's an older answer to this class of problem. When Python needed to put a function on the web, it didn't get a framework that owned your program; it got WSGI and a thin server around it. Your code stayed your code. The layer between "a request arrived" and "call this function" got standardized and stopped being interesting.

That's the shape FastAgent takes for agents. One contract sits in the middle:

```ts
invoke(scope, prompt) => AsyncIterable<AgentEvent>
```

Channels produce invocations. Engines fulfil them. Your infrastructure hosts them. Because everything talks through one small contract, a `channels × engines × hosts` matrix collapses into three independent lists — and none of them is allowed to reach into the others.

The practical consequence is that FastAgent has nothing to move into. There's no dashboard, no control plane, no project format. The directory you already have *is* the deployable unit.

## End to end, for real

Here's the whole path, with nothing skipped. Start with a directory — the one you vibed, or a fresh scaffold:

```bash
npm i -g @fastagent-sh/fastagent
fastagent init my-agent && cd my-agent
fastagent dev
```

You now have a streaming HTTP service on `:8787`, with sessions on disk:

```bash
curl -N -X POST localhost:8787/invoke \
  -H 'content-type: application/json' \
  -d '{"session":"s1","text":"Summarize https://example.com in two bullets"}'
```

```txt
data: {"type":"tool_started","id":"tool-1","name":"fetch-url","args":{"url":"https://example.com"}}
data: {"type":"tool_ended","id":"tool-1","isError":false,"content":{ … }}
data: {"type":"completed"}
```

Reuse that `session` string and turn 7 remembers turn 3. Edit `persona.md` and the next turn picks it up — no restart, no rebuild, no codegen step.

Now give it a way in from the outside world:

```bash
fastagent add github
fastagent add telegram
fastagent dev --tunnel     # public URL for webhook testing
```

Each of those writes a file into `channels/`. That's the entire integration: signature verification, event mapping, streaming replies, and group-awareness are the channel's job, not yours. A file in `channels/` **is** a channel — including one you write.

Give it a clock, too:

```ts
// schedules/daily-digest.ts
export default {
  cron: "0 9 * * *",
  timezone: "America/New_York",
  prompt: "Summarize yesterday's failures and post them to the ops room.",
};
```

Then ship the directory. There's no build artifact, because the directory is the artifact:

```bash
fastagent deploy fly    # writes fly.toml + Dockerfile + a runbook; --run drives it
```

Total new concepts introduced into your project: a directory, and a channel file per trigger.

## The part that matters if you already have an app

Everything above is the standalone path. The more common case is that you already ship something, and the agent is one capability inside it. Then FastAgent isn't a service at all — it's an import.

```ts
import { createPiAgentFromWorkspace, collect } from "@fastagent-sh/fastagent";

const { agent } = await createPiAgentFromWorkspace("./agent", {
  model: "anthropic/claude-sonnet-4",
});

// anywhere: a job, a queue consumer, a test
const { text } = await collect(
  agent.invoke({ session: `user-${user.id}` }, { text: question })
);
```

Want it streaming from a route instead? The handler is a plain Fetch handler, so it mounts wherever your host speaks `Request → Response`:

```ts
import { createInvokeHandler } from "@fastagent-sh/fastagent";

const handler = createInvokeHandler(agent);

// Next.js App Router — app/api/chat/route.ts
export const POST = handler;

// Hono
app.post("/chat", (c) => handler(c.req.raw));
```

That's the whole integration surface. Read it again and notice what *isn't* there: no framework to extend, no base class, no config file that owns your app, no second process, no network hop. Your auth ran before line one. Your database is still your database. `session` is a string you chose, so it can be your user id.

This is the difference the serving-layer shape actually buys. Not fewer lines than a framework — **fewer things that own you.** A framework asks you to be a project of its type; a library asks for an import.

## Where the seams are

Neutrality only means something if the seams are real, so: the engine is one. The built-in harness is [pi](https://pi.dev), and it's the reference implementation of the contract — not a hard dependency of the design. Anything that implements `invoke` is an engine, and channels can't tell the difference. Same for hosts: the agent runs anywhere Node ≥ 22.19 runs, and state is a directory you point somewhere durable.

Tools are typed at the boundary, because the boundary is where the model meets your code:

```ts
// tools/lookup-order.ts — the filename is the tool name
import { defineTool, z } from "@fastagent-sh/fastagent";

export default defineTool({
  description: "Look up an order by id.",
  input: z.object({ orderId: z.string() }),
  async execute({ orderId }) {
    return db.find(orderId);
  },
});
```

Invalid model arguments fail there, as an error you can read, instead of becoming a prompt bug you debug at 2am.

## When not to use this

Some honesty is worth more than another feature list.

- If your agent **is** the product, and you want opinionated batteries — auth, dashboards, multi-tenancy, an admin UI — a full framework will get you further faster.
- If you're already all-in on one cloud and want one click, an integrated platform is less friction than composing.
- If you need **deterministic multi-step orchestration** with retries and compensation, use a workflow engine and call `invoke` from it. FastAgent lets the agent decide its own steps; it doesn't pretend to be Temporal.
- If you need **durable exactly-once execution** across restarts today, know the current state: Telegram's accepted turns replay at least once; general durability is future backend work, and it's listed as such rather than implied.

FastAgent is pre-1.0. The stable center is the contract, and the package API is still tightening.

## The actual pitch

You didn't set out to adopt an agent framework. You set out to make the thing you already built answer a webhook.

That's a serving problem. It deserves a serving layer — one small contract, your directory unchanged, your app still yours.

```bash
npm i -g @fastagent-sh/fastagent
```

The [quickstart](/docs/quickstart/) is the ten-minute version, the [embedding guide](/docs/embedding/) is the library path, and the [Agent Handler SPEC](/docs/spec/) is the contract everything else is built around. It's MIT, on [GitHub](https://github.com/fastagent-sh/fastagent) — a star helps other people find it.

Vibe first. Then FastAgent.

---

*Prefer this managed? [FastAgent Cloud](https://tally.so/r/44DVMB) will run your agents with multi-instance durability, scale-to-zero, and observability built in — self-hosting stays free forever.*
