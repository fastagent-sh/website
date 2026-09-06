---
title: "FastAgent 0.21: service embedding, session control, and AgentCore"
date: 2026-09-06
description: "What ships in FastAgent 0.21: whole-service embedding, session management, custom model endpoints, AWS Bedrock AgentCore, and simpler Slack credentials."
tags:
  - release
  - embedding
  - channels
  - deploy
---

FastAgent **0.21.1** is available on npm. The directory remains the deployable unit, and `invoke(scope, prompt)` remains the Agent Handler contract. Around that contract, recent releases add a complete service API, conversation management, custom model endpoints, and AWS Bedrock AgentCore deployment.

The [agent development guide](/docs/ai-start/) is now the starting point for both humans and coding agents. It covers responsibilities, TypeScript tools, local checks, native channels, scheduling, deployment, and what must survive a restart. Coding agents can read the same guide at [`/start.md`](https://fastagent.sh/start.md).

## From 0.15 to 0.21

| Release | What it brings |
|---|---|
| [0.16](https://github.com/fastagent-sh/fastagent/releases/tag/v0.16.0) | AWS Bedrock AgentCore deployment, explicit workspace/agent placement, and revised Slack and Feishu/Lark conversation routing. Patch releases add local bind control and AgentCore logs. |
| [0.17](https://github.com/fastagent-sh/fastagent/releases/tag/v0.17.0) | Skill-name discovery for session clients, followed by Feishu reply/card and AgentCore state-restore fixes. |
| [0.18](https://github.com/fastagent-sh/fastagent/releases/tag/v0.18.0) | Definition-local `models.json` and Feishu/Lark threads that inherit recent room history and pending discussion. |
| [0.19](https://github.com/fastagent-sh/fastagent/releases/tag/v0.19.0) | `createAgentService`, pi `AgentSession` serving, layered package exports, browser-reachable session control, and definition-local extensions in `chat`. |
| [0.20](https://github.com/fastagent-sh/fastagent/releases/tag/v0.20.0) | Session listing, property updates, forks and deletion; deployer-owned control tokens; credential-write and webhook hardening. |
| [0.21](https://github.com/fastagent-sh/fastagent/releases/tag/v0.21.0) | Two Slack runtime secrets, shared proactive-send transport, direct Slack user destinations, pi 0.85.1, and deployment/registration fixes. [0.21.1](https://github.com/fastagent-sh/fastagent/releases/tag/v0.21.1) lets `fastagent add <kind>` re-run on every existing channel to refresh its send tool. |

The sections below describe the current behavior in 0.21.1.

## Mount the whole service in an existing app

For invocation alone, use `createPiAgentFromDir` and `createInvokeHandler`, or consume `agent.invoke` directly. For native channels, schedules, health, and optional session control together, open the directory as a service:

```ts
import { createAgentService, serveNode } from "@fastagent-sh/fastagent";

const service = await createAgentService(".");
const server = serveNode(service.handler, { port: 8787, host: "127.0.0.1" });
await Promise.all([service.ready, server.listening]);

// On application shutdown, await service.close() and server.close().
```

`createAgentService` binds no port and installs no process signal handlers. An existing host can mount `service.handler` instead of starting another server. The application owns startup, shutdown, authentication, and user-to-session authorization.

The package surface is layered by what the code needs:

- `/core` and `/session`: engine-neutral contracts and clients, with no third-party runtime dependencies.
- `/node`: Node HTTP adapters and engine-neutral service mounting.
- `/pi`: the built-in engine and directory assembly.
- The root export: the supported all-in-one API.

The current durable engine store is `piSessionRecordStore`, implementing `PiSessionRecordStore`. Service assembly owns channel discovery and scheduling; those internal assembly functions are outside the public API.

Read the [embedding guide](/docs/embedding/) and [API reference](/docs/api-reference/).

## Observe and manage conversations

Enable `sessionControl: true` in `fastagent.config.*` to serve the optional `/control/*` API. It exposes live events and durable history alongside actions and session management:

```ts
import { connectSessionControl } from "@fastagent-sh/fastagent/core";

const control = await connectSessionControl({ url, token });
const conversations = await control.sessions.list();
const session = control.sessions.get("support:42");
const state = await session.state();
await session.update({ name: "Order investigation" });
```

Clients can steer or abort an active run, queue a follow-up, compact history, change supported model/thinking settings, move the active history branch, fork a conversation, or delete it. Check `capabilities()` and operation results before assuming an action is available or has completed. `invoke` still starts work.

Locally, `dev` and `start` write a per-boot token to the state directory's `control.json`. On a deployment, supply `FASTAGENT_CONTROL_TOKEN` through the host's secret store. Use `--bind 127.0.0.1` for a local-only server.

The token controls the whole deployment. Keep it out of customer browsers and enforce authorization for every session, including both source and destination of a fork. The default `/invoke` endpoint has no authentication. See [session control](/docs/api-reference/#session-control-observation-plane).

## Declare a custom model endpoint

An agent's `models.json` travels with its definition. A self-hosted model or gateway needs data rather than a custom provider implementation:

```json
{
  "providers": {
    "mygw": {
      "baseUrl": "https://llm-gateway.example.com/v1",
      "api": "openai-completions",
      "apiKey": "$MYGW_API_KEY",
      "models": [{ "id": "my-model", "contextWindow": 65536 }]
    }
  }
}
```

Select `mygw/my-model` in `fastagent.config.*`. Built-in providers remain available. `deploy` recognizes a selected model's environment-key reference and carries that secret to the host. Use `deploy.secrets` for additional values it cannot infer, such as custom header secrets.

The machine-global pi model configuration is excluded so development and deployment use the same definition. Malformed endpoint configuration fails visibly. See [custom model endpoints](/docs/configuration/#custom-model-endpoints).

## Deploy to four supported targets

```bash
fastagent deploy docker
fastagent deploy fly
fastagent deploy railway
fastagent deploy agentcore
```

Each command generates the selected host's artifacts and runbook. Add `--run` after reviewing the plan to provision and deploy through the host's CLI.

Docker, Fly, and Railway use a resident process with durable state and secrets storage. Run one active replica with the shipped file-backed state. Schedules and outbound long connections require an awake process; Fly's generated settings account for that, and Railway App Sleeping must remain off for those workloads.

AWS Bedrock AgentCore uses a different topology:

- a local arm64 build pushed to ECR;
- a CloudFormation Runtime and Lambda forwarder for webhook ingress;
- EventBridge schedules and optional wake alarms;
- an S3 snapshot for the shared webhook/schedule ingress state, including model credentials.

Direct `InvokeAgentRuntime` sessions have their own storage and do not receive that cross-deploy snapshot or external wake-alarm guarantee. Long-connection channels require a resident host. The generated forwarder is `lambda/forwarder.js`.

In 0.21, Fly explicitly allocates ingress addresses, tunnels wait for an edge connection, and webhook registration uses the platform's own URL verification. These checks make failures visible before a deployment is reported ready. A real conversation and scheduled delivery still need separate verification.

See the [deployment reference](/docs/deploy/) or the [AgentCore walkthrough](/blog/deploy-ai-agent-aws-bedrock-agentcore/).

## Slack credentials and proactive delivery

Slack runtime configuration now contains exactly two secrets: `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`. App Configuration tokens stay on the builder machine for app creation and Request URL updates; OAuth client credentials are setup-only. New apps use long-lived bot tokens.

`fastagent add slack --group-behavior context|mentions` chooses the app's scopes and subscriptions. Runtime routing has one behavior: Slack replies attach to a thread, and that thread carries the conversation. With history subscriptions, the agent answers unmentioned thread follow-ups while it participates and has heard only one human. A second human restores mention-required behavior.

`slack-send` uses the mounted channel's transport. A `U…` user ID can be its `channelId` to open a DM; the result reports the `D…` channel ID needed for file delivery. Use send tools for proactive messages or files. The chat channel already delivers normal replies.

Every `fastagent add <kind>` refreshes the package-owned companion send tool while keeping the channel file; 0.21.1 extends that to Telegram and GitHub, which previously refused to re-run when the channel file already existed. Apps created with bot-token rotation by older releases need recreation; Slack cannot disable rotation on an existing app. Follow [Slack setup and upgrade guidance](/docs/slack/#upgrading-from-a-rotating-token-app-releases-up-to-020) before restarting one under 0.21.

## Feishu, Lark, tools, and state boundaries

Feishu/Lark direct messages share a chat session. Group mentions answer in place; threads have separate sessions seeded from recent room history. A thread's first turn also reads pending room discussion. Group visibility still depends on tenant-approved permissions. Slack follows its own threaded placement rules rather than copying Feishu's chat layout.

Directory agents have all seven coding tools, including a shell. Typed tool validation and prompt instructions do not isolate the process. Definition-local `extensions/` run in `fastagent chat`; serving warns and leaves them unloaded because pi's extension runtime is not isolated across concurrent sessions. Use `tools/` for model-callable capabilities needed by a service.

Credential writes are atomic and enforce owner-only file/directory permissions. Telegram, Slack, and Feishu/Lark replay accepted turns at least once; side effects must tolerate repetition. GitHub's post-ACK work has no durable replay.

## Start or update

```bash
npm install --global @fastagent-sh/fastagent@0.21.1
fastagent init my-agent
cd my-agent
fastagent dev --bind 127.0.0.1
```

For an existing agent, update the package that imports FastAgent too, including an enclosing application when applicable. Keep `fastagent.config.*` in the agent directory and run from the intended workspace. Preserve both state and secrets, refresh companion send tools, and review the release notes before exposing the service.

The [agent development guide](/docs/ai-start/) provides the full verification path. The [0.21.0](https://github.com/fastagent-sh/fastagent/releases/tag/v0.21.0) and [0.21.1](https://github.com/fastagent-sh/fastagent/releases/tag/v0.21.1) release notes list the exact API and Slack changes.
