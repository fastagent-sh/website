---
title: "Turn an agent directory into a Feishu or Lark teammate"
date: 2026-09-06
description: "Connect a file-defined agent to Feishu or Lark with explicit permissions, thread behavior, streaming cards, durable turn intent, and a deployable webhook path."
tags:
  - feishu
  - lark
  - channels
  - tutorial
---

A Feishu or Lark agent needs more than an event callback. The app must choose an ingress transport, request the right message visibility, publish a version, preserve chat state, render long model responses, and behave predictably in rooms and threads.

FastAgent v0.17.1 supplies the channel machinery around a file-defined agent. This guide covers the decisions the CLI cannot make for you and the human steps the platform does not automate.

The result is a bot that:

- answers direct messages and explicit group mentions;
- can hear background discussion when the tenant grants the broader group scope;
- continues a two-person thread without requiring `@Agent` on every message;
- streams progress and the answer into one card;
- persists accepted turn intent before acknowledging the event;
- can run through webhook or WebSocket ingress.

## Choose Feishu or Lark

Feishu and Lark international use the same event, crypto, card, and API shapes, but they are separate clouds with separate consoles and credentials.

| | Feishu | Lark international |
| --- | --- | --- |
| Console | [open.feishu.cn](https://open.feishu.cn/) | [open.larksuite.com](https://open.larksuite.com/) |
| Add command | `fastagent add feishu` | `fastagent add lark` |
| Webhook path | `POST /feishu` | `POST /lark` |
| Required prefix | `FEISHU_*` | `LARK_*` |
| State directory | `channels/feishu/` | `channels/lark/` |

Choose the cloud where the tenant actually lives. One FastAgent definition can mount both, but that means two apps, two credential sets, and two independent state homes.

Feishu is the reference onboarding path. Lark uses a compatibility profile and currently requires more guided console work where its app-creation or application-configuration APIs differ.

## Choose webhook or WebSocket ingress

The two transports feed the same message engine, but they create different deployment requirements.

| | Webhook | WebSocket long connection |
| --- | --- | --- |
| Public HTTPS URL | required | not required |
| Runtime credentials | App ID, Secret, Verification Token; Encrypt Key optional | App ID and Secret |
| Scale to zero | possible only when no other always-on producer exists | incompatible |
| Platform setup | Request URL + publish | long-connection mode + publish |
| Best fit | public container host or AgentCore forwarder | private/localhost development and always-on servers |

Webhook is usually the more portable production choice. WebSocket is useful when exposing a public URL is undesirable, but the outbound connection itself is ingress. If the process sleeps, there is nothing left to receive an event.

This is an app-level choice in Feishu/Lark, not a runtime fallback. The platform uses one event-subscription mode at a time. Migrating later requires changing the channel factory and the console mode together, followed by publishing the app version.

## Run the onboarding flow

From the workspace that contains the agent:

```bash
fastagent add feishu
# or
fastagent add lark
```

The interactive flow asks for ingress and group behavior. Explicit non-interactive forms are also available:

```bash
fastagent add feishu --ingress websocket --group-behavior context
fastagent add lark --ingress webhook --group-behavior mentions
```

Feishu’s default onboarding uses its scan-to-create device authorization flow. The CLI opens and prints a one-time confirmation link, the user confirms it, and the platform creates an app from the FastAgent template. App ID and App Secret are written immediately to `fastagent/.secrets/.env`, protected by the scaffolded nested `.gitignore`.

For WebSocket, those two values are the complete runtime credential set. For webhook, onboarding continues through a temporary challenge endpoint because the platform-generated Verification Token has no general read API. If the flow is interrupted after the app credentials were saved, rerunning resumes against that app instead of silently creating another one.

Lark cannot complete every Feishu control-plane operation. Its flow opens the relevant console pages and asks for credentials or configuration when the international API reports that the operation is unavailable.

Onboarding creates:

```text
fastagent/
├── channels/feishu.ts       # or channels/lark.ts
└── tools/feishu-send.ts     # or tools/lark-send.ts
```

The channel file is inbound. The send tool is for out-of-band delivery from schedules or wake-ups. Do not call the send tool to answer the current chat turn; the channel already delivers that answer and the extra call will post it twice.

## Review permissions before publishing

A useful bot and a least-privilege bot can require different message visibility. Decide explicitly.

### Mention-only groups

This posture uses the group-at-mention permission. The platform sends messages that address the bot. Every group turn requires an explicit mention, and unmentioned room discussion cannot be buffered because the channel never receives it.

Choose this when the agent should act like a command surface or when broad group visibility is not acceptable.

### Context-aware groups

This posture also requests `im:message.group_msg`, a sensitive scope requiring tenant administrator approval. The platform can then deliver ordinary human group messages. FastAgent buffers unsummoned discussion per conversation place and folds it into the next answered turn.

The broader scope buys hearing, not permission to speak. Main-timeline group messages still require `@Agent`. A bare continuation in a thread is accepted only while the agent participates there and has not heard a second human.

The main permissions are:

- receive direct messages;
- receive group mentions;
- optionally receive all group messages for context-aware behavior;
- send messages as the bot;
- read message resources for images and files;
- optionally read a replied-to message by ID;
- create and update cards for streaming output.

Review the current names in the [Feishu developer documentation](https://open.feishu.cn/document/home/index) or [Lark developer documentation](https://open.larksuite.com/document/home/index). Platform permissions change independently of FastAgent releases.

After permissions and event mode are correct, create and publish an app version. Tenant-admin approval and version publication remain human console actions. A CLI message saying the draft was configured does not mean the tenant is already running that version.

## Test direct messages, rooms, and threads

Test behavior, not only connectivity.

### Direct message

Send a plain question. A direct chat has one human, so the agent answers without a mention and uses one continuous session for that chat.

### Group main timeline

Add the bot, write one unmentioned message, then mention it with a related question.

- In mention-only mode, the first message is invisible to the app.
- In context-aware mode, the first message is buffered and becomes context for the explicit turn.

The answer appears in the room quoting the question. FastAgent does not automatically relocate every group answer into a thread.

### Group thread

Open a thread and mention the agent once. Its answer makes it a participant. A bare continuation from the same human can then invoke it without another mention.

Ask a second human to speak in that thread. Addressing is now ambiguous, so the next agent turn requires a mention again. The agent keeps listening in context-aware mode.

Participation means “what this deployment heard,” not a complete platform roster. A thread the bot joined before its participation state existed needs one mention to re-enter.

### Quoted message and attachment

Reply to a message or file and mention the bot. When the app has permission, the channel loads the referenced message because its body is not included in the receive event. An unreadable referent becomes a visible marker in the prompt instead of causing the whole ask to vanish.

Images are passed as vision input; the selected model must support them. Other files are downloaded under the channel state directory and exposed to the agent through file paths.

## Understand the streaming card

Each answered turn uses one card entity:

1. create and mount a “Thinking” card;
2. update the same card with tool progress and answer snapshots;
3. disable streaming and settle that card into the final Markdown answer.

A queued turn gets a quoted “Queued” card immediately. When its turn starts, execution takes over that card and settles it in place. Users do not receive a queue notice, a second answer message, and a recall tombstone.

Cards are the right primitive for this platform because text messages have tighter mutation limits. They also render code blocks, tables, and links more reliably than repeatedly editing plain text.

Failures degrade visibly:

- if card creation fails, use a static text placeholder and settle through text;
- if streaming closes during a long turn, freeze the preview but still attempt final delivery;
- if an answer exceeds one card, settle the first chunk and send the remainder separately;
- keep full diagnostics in operator logs and return a neutral user-facing error by default.

## Deploy the channel

### WebSocket

Run it on a host that keeps one process alive:

```bash
fastagent deploy docker --run
# or a Fly/Railway deployment configured not to sleep
```

Provide App ID and Secret. There is no webhook registration call. Health becomes ready after the long connection completes its first successful handshake, while the official SDK owns ordinary reconnects.

Do not use the current FastAgent long-connection channel on the AgentCore target. FastAgent v0.17.1’s AgentCore adapter serves its HTTP `/invocations` contract and does not map this channel abstraction onto AgentCore’s optional WebSocket protocol.

### Webhook

A webhook deployment needs a stable HTTPS origin. FastAgent deployment targets register the URL automatically where the platform control plane permits it, or print the exact console step.

```bash
fastagent deploy fly --run
fastagent deploy railway --run
fastagent deploy agentcore --run
```

The runtime needs App ID, Secret, Verification Token, and the optional Encrypt Key if configured in the console. With an Encrypt Key, ordinary webhook events require the raw-body signature and encrypted payload; plaintext ordinary events are refused. Without one, the Verification Token authenticates plaintext events.

For AgentCore, the generated Lambda Function URL forwards the original request into the fixed Runtime ingress session. The Feishu/Lark channel still performs its normal verification inside the container.

## Failure and replay boundaries

Feishu and Lark expect fast event acknowledgements. The channel persists accepted turn intent before returning HTTP 200 or the WebSocket ACK frame, then processes turns through a per-session FIFO.

State under `<state root>/channels/<kind>/` includes:

- accepted turns awaiting completion;
- recently seen message IDs for bounded delivery deduplication;
- the bot’s own cached identity;
- observed thread participation;
- buffered unsummoned context;
- downloaded inbound files.

If the process crashes after acknowledgement, an unfinished accepted turn can replay after restart. That is an at-least-once floor, not exactly-once execution. A crash between state files, a duplicate older than the seen ring, or an ambiguous downstream API response can repeat a tool side effect.

Use idempotency keys for consequential tools. Keep the channel state on durable storage. Do not let two processes share the file-backed state directory; the shipped tier is single-process.

One conversation place is one queue. A busy room serializes its turns, while separate threads and chats can proceed concurrently. Session storage has no general TTL or garbage collector in v0.17.1, so a long-running deployment should monitor growth.

## What remains manual

The onboarding flow removes repetitive setup but does not eliminate platform governance:

- the user confirms app creation;
- tenant administrators approve sensitive group visibility;
- the operator selects or verifies subscription mode;
- the operator creates and publishes a version;
- Lark may require manual Request URL or permission steps where its control-plane API differs;
- the operator chooses a durable host and supplies secrets.

Those are useful boundaries. An agent-serving CLI should not silently grant itself broader room visibility or publish a tenant application.

Read the versioned [Feishu/Lark channel guide](https://github.com/fastagent-sh/fastagent/blob/v0.17.1/docs/feishu.md), the [participant model](https://github.com/fastagent-sh/fastagent/blob/v0.17.1/docs/design/participant-model.md), and the [FastAgent source](https://github.com/fastagent-sh/fastagent) before configuring a production tenant.
