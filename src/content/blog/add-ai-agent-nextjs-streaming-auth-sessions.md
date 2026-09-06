---
title: "How to add an AI agent to an existing Next.js app—with streaming, auth, and persistent sessions"
date: 2026-08-25
description: "Embed a file-defined agent in an existing Next.js application while keeping the application's authentication, database, routes, and deployment boundaries."
tags:
  - embedding
  - nextjs
  - serving
  - tutorial
---

The useful boundary for an agent inside an existing product is usually smaller than a new application. Your Next.js app already has users, authentication, database access, routes, logs, and a deployment process. The agent should enter through those boundaries instead of creating a second backend beside them.

This guide adds a file-defined FastAgent agent to a Next.js App Router project. The finished route:

- authenticates the request with the application’s existing auth function;
- chooses the FastAgent session on the server instead of trusting a browser-supplied user ID;
- streams `AgentEvent` objects over Server-Sent Events;
- calls an existing order database through a typed tool;
- keeps the agent definition in ordinary files under `fastagent/`.

Updated for FastAgent **v0.21.1** on September 6, 2026. Requires Node.js 22.19 or newer. The complete library surface is documented in the [embedding guide](/docs/embedding/).

## Start from the application boundary

Assume the application already looks roughly like this:

```text
storefront/
├── app/
│   ├── api/
│   └── support/
├── src/
│   ├── auth.ts
│   └── db.ts
├── package.json
└── next.config.ts
```

Install FastAgent and initialize an agent inside the same repository:

```bash
npm install @fastagent-sh/fastagent@0.21.1
npm install --global @fastagent-sh/fastagent@0.21.1
fastagent init .
```

`init` places the agent in `./fastagent/` and leaves the rest of the application alone:

```text
storefront/
├── app/
├── src/
└── fastagent/
    ├── persona.md
    ├── skills/
    ├── tools/
    ├── fastagent.config.mjs
    ├── package.json
    └── .secrets/
```

The outer repository is the workspace. The agent’s coding tools operate there, and a repository-level `AGENTS.md` remains project context. `persona.md` is the agent’s identity; it does not replace application authorization or business policy.

Run the agent before embedding it:

```bash
fastagent dev --bind 127.0.0.1
```

The first interactive run lets you choose a model and saves that selection to `fastagent/fastagent.config.mjs`. Test one local turn, then stop the development server.

The CLI mounts the full coding-tool set, including a shell. The customer-facing route below explicitly mounts only `lookup-order`. It uses the same persona but supplies its model and tool list through the library API. Set `FASTAGENT_MODEL` to your chosen `provider/modelId` in the Next.js environment. Supply provider keys through the application's environment or use the project login file; library embedding does not load the CLI's `.secrets/.env`.

## Mount the agent behind a Route Handler

Create one module that assembles the agent once for the application process:

```ts
// src/support-agent.ts
import {
  createInvokeHandler,
  createPiAgentFromDefinition,
  piSessionRecordStore,
} from "@fastagent-sh/fastagent";
import lookupOrder from "../fastagent/tools/lookup-order.ts";

const model = process.env.FASTAGENT_MODEL;
if (!model) throw new Error("Set FASTAGENT_MODEL in the application environment");

const runtime = await createPiAgentFromDefinition("./fastagent", {
  model,
  cwd: process.cwd(),
  tools: [lookupOrder],
  sessions: piSessionRecordStore({
    dir: process.env.FASTAGENT_SESSIONS_DIR ?? "./fastagent/.state/sessions",
  }),
});

export const supportAgent = runtime.agent;
export const invokeSupportAgent = createInvokeHandler(runtime.agent);
```

`createPiAgentFromDefinition` reads the named definition and uses the explicitly supplied model, tools, and session store. `cwd` keeps the application root as the workspace. The `tools` option replaces the default coding tools, so this route offers no shell or filesystem tool. The definition's `AGENTS.md` and workspace ancestor context can still enter the prompt; keep that context suitable for every user of this agent. The application remains responsible for process isolation and every tool's authorization.

`createInvokeHandler` returns a Fetch-shaped function:

```text
Request → Promise<Response>
```

That shape fits a [Next.js App Router Route Handler](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) directly. A public route could export it as `POST`, but an application route should normally wrap it so the app can authenticate and choose the session.

The FastAgent handler accepts JSON of this shape:

```json
{
  "session": "opaque-session-id",
  "text": "Where is order 9231?"
}
```

It returns `text/event-stream`. According to the [Server-Sent Events format](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events), each event arrives as a `data:` record separated by a blank line.

## Keep authentication in the app

Do not let the browser choose `session: user-123`. If the application trusts that value, one authenticated user can ask for another user’s conversation simply by changing a string.

Read the user from the application’s auth layer, validate the question, then construct a new internal request for FastAgent:

```ts
// app/api/support/route.ts
import { auth } from "@/src/auth";
import { invokeSupportAgent } from "@/src/support-agent";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const identity = await auth();
  const userId = identity?.user?.id;

  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const text =
    typeof input === "object" && input !== null && "text" in input
      ? (input as { text?: unknown }).text
      : undefined;

  if (typeof text !== "string" || text.trim() === "" || text.length > 8_000) {
    return Response.json({ error: "text must be 1–8000 characters" }, { status: 400 });
  }

  const internalRequest = new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session: `support:${encodeURIComponent(userId)}`,
      text,
    }),
    signal: request.signal,
  });

  return invokeSupportAgent(internalRequest);
}
```

Authentication finishes before the agent starts. The model never receives a credential and never decides which customer owns the conversation. If your product has organization membership, support entitlement, or account suspension checks, put them in this wrapper too.

The route also forwards `request.signal`. If the browser disconnects, cancellation reaches the FastAgent handler and then the underlying invocation instead of leaving unnecessary model work running.

## Map users to sessions

FastAgent treats `scope.session` as an opaque string. Reuse a string to continue a conversation; choose a different one to create a separate conversation.

A single support conversation per user can use:

```ts
session: `support:${encodeURIComponent(userId)}`
```

If users can open several conversations, address the conversation in the application database and verify ownership before invoking:

```ts
const conversation = await db.supportConversation.findFirst({
  where: { id: conversationId, userId },
});

if (!conversation) {
  return Response.json({ error: "not found" }, { status: 404 });
}

const fastagentSession = `support:${encodeURIComponent(userId)}:${conversation.id}`;
```

This is an application decision. FastAgent supplies conversation continuity and a one-writer lease; it does not create user, tenant, or membership concepts.

Two concurrent requests to the same FastAgent session do not run against stale copies of the same transcript. The core returns a retryable `session_busy` failure for the second writer. A UI can disable submit while one turn is active, queue in the application, or expose an explicit interactive policy through the optional session control surface. It should not silently create a second session just to hide the conflict.

## Use the existing database through a typed tool

An embedded agent becomes useful when it can use capabilities the application already owns. Add a definition-local tool:

```ts
// fastagent/tools/lookup-order.ts
import { defineTool, z } from "@fastagent-sh/fastagent";
import { db } from "../../src/db.ts";

export default defineTool({
  name: "lookup-order",
  description: "Look up an order by its public order number.",
  input: z.object({
    orderNumber: z.string().min(1),
  }),
  async execute({ orderNumber }, { sessionManager }) {
    const session = sessionManager?.getSessionId();
    const encodedUserId = session?.split(":")[1];

    if (!session?.startsWith("support:") || !encodedUserId) {
      throw new Error("lookup-order requires an authenticated support session");
    }

    const order = await db.order.findFirst({
      where: {
        orderNumber,
        userId: decodeURIComponent(encodedUserId),
      },
      select: {
        orderNumber: true,
        status: true,
        shippedAt: true,
        trackingUrl: true,
      },
    });

    return order ?? { found: false };
  },
});
```

The explicit `name` is required because the application imports this tool directly. The CLI's directory discovery also names it `lookup-order` from the filename. Use the `z` re-export from FastAgent so the schema and tool adapter share one Zod copy.

Now make the policy explicit in `fastagent/persona.md`:

```text
You are the support assistant for this store.
Use lookup-order for order-status questions.
Never claim an order changed unless a tool result says it changed.
Do not expose fields that the tool did not return.
```

The example deliberately returns a narrow projection and scopes the query to the authenticated user encoded by the server-owned session. `sessionManager` reads invocation context; the model cannot supply or change it. An author-written tool is trusted server code and can import anything the process can access, so the tool itself must enforce data minimization and authorization rather than exposing a general database client.

## Stream the response

The browser receives FastAgent events, not one large JSON answer. A small parser can consume the SSE body:

```ts
export async function streamSupport(
  text: string,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/support", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`support request failed: ${response.status}`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  for (;;) {
    const { value = "", done } = await reader.read();
    buffer += value;

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) {
          onEvent(JSON.parse(line.slice(6)));
        }
      }
    }

    if (done) break;
  }
}
```

For an event whose `type` is `text`, render its `delta` as it arrives. Treat `tool_started`, `tool_ended`, and `retrying` as progress, not answer text. Every normal stream ends in exactly one `completed` or `failed` event. A transport ending without a terminal event is not a successful turn.

## Deploy with the right state model

Embedding does not make deployment stateless. Sessions and the per-session lease still need a coherent home.

This example supplies its session store explicitly. On a long-running Node container, set the variable that module reads and keep model credentials durable:

```bash
FASTAGENT_SESSIONS_DIR=/data/.state/sessions
FASTAGENT_SECRETS_DIR=/data/.secrets
```

Setting `FASTAGENT_STATE_DIR` alone does not move this explicitly constructed store. The higher-level `createPiAgentFromDir` and `createAgentService` resolve that state root automatically.

The shipped JSONL store is a single-process tier. One process can serve many sessions, and different sessions can run concurrently, but scaling the application to several independent instances will split local state and leases. A multi-instance application needs implementations of `PiSessionRecordStore` and `Lease` backed by shared infrastructure.

If you build a custom Next.js container, copy the `fastagent/` directory and every application module imported by its tools into the runtime image. A standalone Next.js bundle does not automatically prove that dynamically discovered agent files were included.

This is also why a default FastAgent directory should not be presented as an out-of-the-box durable deployment on Vercel’s stateless function tier. A function may disappear between turns, and local files do not form one shared session repository across instances. Use a resident Node/container deployment, or supply external state and lease adapters before claiming that topology is durable.

## When not to use this shape

Use a direct model call when the feature is one stateless completion and does not need tools, sessions, streaming events, or a file-defined agent. The application route will be simpler.

Use an opinionated agent platform when the agent is the whole product and you want that platform to own users, dashboards, orchestration, and deployment.

Use a workflow engine when the business process needs deterministic steps, retries, compensation, and audit semantics. FastAgent lets the agent choose its own steps; it can be invoked from a workflow, but it does not replace one.

For the embedded case, the useful contract remains small: the app authenticates, chooses a session, and hands one prompt to an event stream. Read the [embedding reference](/docs/embedding/) and [public API](/docs/api-reference/) before adapting the example to your own auth and state backends.

For a trusted agent that also needs native channels and scheduling, `createAgentService` mounts the whole directory and owns those lifetimes. Its optional session control API can list, observe, steer, fork, and delete conversations. Keep its deployment-wide bearer token server-side and authorize every session, including both ends of a fork, before exposing any control operation to a customer.
