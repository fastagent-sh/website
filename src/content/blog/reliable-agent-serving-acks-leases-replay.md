---
title: "What reliable agent serving actually means: ACKs, leases, replay, and failure windows"
date: 2026-09-09
description: "A precise guide to the reliability guarantees that sit between an accepted webhook and a completed agent turn."
tags:
  - reliability
  - sessions
  - channels
  - design
---

“Durable agent” is too broad to be useful. A webhook can be durably accepted while its model turn is lost. A conversation can survive restart while a tool side effect happens twice. A channel can deduplicate deliveries while still replaying an interrupted turn.

Reliable agent serving becomes easier to reason about when the path is split into stages:

```text
receive → verify → persist intent → acknowledge → invoke → run tools → deliver → settle
```

Each arrow has its own failure window. FastAgent v0.17.1 deliberately provides different guarantees for different channels instead of applying one durability label to all of them.

## Split the delivery path into stages

Consider a chat message that asks an agent to refund an order.

1. **Receive:** the host reads an HTTP or WebSocket event.
2. **Verify:** the channel checks a signature, token, timestamp, and body limit.
3. **Route:** policy decides whether the message should invoke the agent and chooses a session.
4. **Persist intent:** a stateful channel records the accepted turn before acknowledging the platform.
5. **Acknowledge:** the platform receives HTTP 200, 202, or its transport-specific ACK.
6. **Invoke:** the channel acquires the session’s writer lease and opens the transcript.
7. **Execute:** the model and tools perform the turn.
8. **Deliver:** the channel streams or posts the answer.
9. **Settle:** durable turn intent is removed or marked complete.

A failure before acknowledgement normally asks the sender to redeliver. A failure after acknowledgement is now the deployment’s responsibility. That is why the placement of the durable write matters more than the word “persistent.”

Security is part of the same path. GitHub signs the raw body; Slack signs a timestamp and raw body; Telegram can carry a secret token; Feishu/Lark can use encrypted signed events. Verification must happen before parsing untrusted content into an agent turn.

GitHub’s own [webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks) recommend fast responses and asynchronous processing. The asynchronous half still needs an explicit recovery design.

## Acceptance is not completion

An ACK has a narrow meaning: the receiver accepted responsibility for the delivery. It does not mean the model completed, the tool succeeded, or the answer reached the user.

FastAgent’s GitHub channel illustrates the weakest shipped post-ACK tier:

- verify HMAC;
- map the event to intents;
- return `202 Accepted`;
- run the turns in the current Node process.

If the process exits after the 202, the review is lost. GitHub has no reason to redeliver because it received a success response. The operator log is the remaining evidence.

Telegram, Slack, and Feishu/Lark use a stronger acceptance boundary. They persist accepted turn intent before ACK and replay unfinished records on restart. A platform redelivery or process crash can still cause another attempt, so the guarantee is at least once.

These are both honest and useful tiers:

| Tier | Meaning |
| --- | --- |
| Verified, post-ACK in-process | Authentic event, but accepted work can be lost with the process |
| Persisted intent, at-least-once replay | Accepted work survives restart, but execution can repeat |
| Exactly-once side effect | Requires downstream idempotency or a transactional system; not supplied generally by FastAgent |

The guarantee should be stated per path. Saying “FastAgent is durable” without naming a channel, state store, and deployment hides the decision that matters.

## Why one session needs one writer

Conversation state is causal. Turn seven may refer to turn six, and a tool may change which tools are active for later turns. Two writers cannot safely read the same leaf, produce independent answers, and append both as if they happened in one order.

The FastAgent core therefore acquires a lease for the activity window of one invocation. Another direct invocation against the same session fails with:

```json
{
  "type": "failed",
  "code": "session_busy",
  "retryable": true
}
```

Channels can choose a policy above that floor. Stateful chat channels maintain a per-session FIFO, while HTTP and GitHub use fail-fast behavior.

The session string is chosen by the host or channel:

- a direct API can map it to an authenticated user conversation;
- a Feishu room maps to one room session;
- a thread maps to another session;
- a static schedule derives one from the schedule name.

That means the lease is also the unit of ordering. Separate threads can run concurrently because users already declared them separate conversation places.

The shipped default lease is in-process. The JSONL transcript and file-backed channel stores are also a single-process tier. Horizontal scaling requires a shared session repository, distributed lease, credential state, and channel intent backend. Mounting the same local directory into several processes does not create those semantics.

## What at-least-once replay guarantees

A persisted turn record answers one question:

> After accepting this event, can the channel remember that unfinished work exists after a restart?

If yes, the next process can invoke the agent again. It does not continue the JavaScript stack or model stream from the exact instruction where the previous process stopped.

That distinction creates three possible crash points:

1. **Before the agent starts.** Replay starts it once later. This is the clean case.
2. **During model reasoning, before a side effect.** Replay recomputes the turn and may produce a different path.
3. **After a tool side effect, before settlement.** Replay can call the tool again.

A poison-turn ceiling prevents one permanently failing event from blocking a queue forever, but it does not convert failure into success. Operators still need logs and a way to inspect or discard bad work.

Channel deduplication solves a related but different problem: the platform may push the same delivery more than once even after a successful ACK. A bounded `seen` store filters recent duplicate IDs. If the state write and seen-ring write are separate, a crash between them can still admit a duplicate. If an ID is older than the ring, it may be accepted again.

At-least-once replay is valuable precisely because it states the remainder instead of hiding it.

## Where side effects can duplicate

The agent transcript can be repaired after interruption. If a tool call was appended without a matching result, FastAgent can add an explicit interrupted error record so the next model request receives a valid transcript.

That repair says nothing about the world outside the transcript. The tool may have:

- sent an email;
- created a refund;
- posted a chat message;
- started a deployment;
- written to a third-party API that timed out after accepting the request.

Tools performing consequential actions should accept an application idempotency key. Good candidates include the inbound delivery ID, scheduled slot, order-action ID, or a durable application job ID. The downstream system should record the key with the side effect and return the existing result on retry.

Read-only tools are naturally easier to replay. For write tools without downstream idempotency, design an explicit confirmation or reconciliation step instead of pretending a retry is safe.

Output delivery can be ambiguous too. A process can send a reply and crash before removing turn intent. Replay then sees unfinished work and may send another reply. Some channels maintain a live preview entity that can be updated in place, reducing duplicate visible messages, but the underlying failure window still needs to be documented.

## Compare the shipped channels

The following matrix describes FastAgent v0.17.1’s default adapters:

| Surface | Acceptance | Queue policy | Restart recovery | Important remainder |
| --- | --- | --- | --- | --- |
| HTTP/SSE `/invoke` | request remains open for the turn | same-session fail-fast | transcript survives only with durable session store | caller owns retry and idempotency |
| GitHub | verified delivery, then 202 | same-session fail-fast | no durable post-ACK intent | in-flight turn is lost on process exit |
| Telegram | turn intent persisted before ACK | per-session FIFO | unfinished turn replays at least once | tool and delivery side effects can repeat |
| Slack | signed event, intent persisted before ACK | per-session FIFO | unfinished turn replays at least once | overlapping event forms need logical dedup |
| Feishu/Lark | verified/decrypted event, intent persisted before ACK | per-session FIFO | unfinished turn replays at least once | bounded message-ID dedup is not exactly once |
| Static schedule | slot claimed before invocation | stable schedule session | run history persists on durable state | started tool work is not generally replay-safe |
| Self-scheduled wake | persisted wake entry | originating session | host-specific alarm can wake shared ingress | direct AgentCore sessions have a weaker alarm path |

This matrix should influence deployment. A channel with durable intent still loses that intent if its state directory is ephemeral. A GitHub channel does not gain replay simply because the session transcript is on a volume.

## How deployment changes the failure window

### Resident Docker hosts

A persistent volume can hold sessions and channel state across process restart. `restart: unless-stopped` can bring the process back, after which replaying channels find unfinished records.

One machine remains the shipped topology. Several replicas with separate volumes split sessions; several processes sharing one local directory are unsupported.

### Fly.io and Railway

A webhook can wake a suspended request-driven service, but an already-acknowledged GitHub turn has no new request available to resume it. Cron, wake, and long WebSocket connections also need resident compute. FastAgent preflight prevents known incompatible Fly settings and warns about Railway sleeping behavior.

Durable volumes preserve files, not in-flight process state. Recovery still follows each adapter’s intent semantics.

### AWS Bedrock AgentCore

AgentCore uses per-session compute. FastAgent’s shared webhook/schedule ingress snapshots its state root to S3 because managed session storage is reset on Runtime version updates. The deploy path checkpoints and stops the old ingress session before probing the new image.

Replaying chat channels can recover persisted accepted turns from that snapshot. GitHub remains post-ACK without replay. Direct programmatic Runtime sessions do not share the ingress snapshot and have a different cross-deploy state tier.

### Serverless functions

A function that returns the ACK and is immediately frozen cannot safely host in-process post-ACK work. File-backed sessions also do not become shared merely because each function invocation can write a temporary file.

Use a durable queue and worker, or choose a resident/AgentCore topology whose execution model matches the channel.

## When you need a workflow or queue above FastAgent

Put a queue or workflow above `agent.invoke` when accepted work must have an application-level lifecycle:

- durable job IDs;
- retries with backoff and dead-letter handling;
- exactly defined ownership and authorization;
- multi-step compensation;
- cross-instance routing;
- human approval states;
- downstream idempotency records;
- service-level objectives independent of a chat transcript.

The worker can still stream FastAgent events into a job log and deliver the final answer through an application-owned channel. FastAgent remains the reasoning and tool-execution component; the queue owns durable work.

The useful reliability question is never “is the agent durable?” Ask instead:

1. What was persisted before the ACK?
2. Which ID deduplicates platform delivery?
3. Which lease prevents concurrent transcript writers?
4. What happens after process death?
5. Which side effects are idempotent?
6. Where does state live during deployment and scaling?

FastAgent’s normative turn contract is in the versioned [Agent Handler SPEC](https://github.com/fastagent-sh/fastagent/blob/v0.17.1/docs/SPEC.md). Channel mechanics and current limits are documented in [Channels](https://github.com/fastagent-sh/fastagent/blob/v0.17.1/docs/channels.md), [Core design](https://github.com/fastagent-sh/fastagent/blob/v0.17.1/docs/design/core.md), and the [MIT-licensed source](https://github.com/fastagent-sh/fastagent).
