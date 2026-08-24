---
title: "Give an AI agent a clock: cron, wake, and self-scheduling without a workflow DSL"
date: 2026-08-31
description: "Use static schedules for known jobs and persisted wake-ups for agent-chosen follow-ups, with clear delivery and retry semantics."
tags:
  - schedules
  - automation
  - serving
  - design
---

Agents are usually shown responding to a person. Production agents also need to act when nobody is present: prepare a report every morning, check a deployment in ten minutes, or revisit an incomplete task tomorrow.

Those are two different kinds of time:

- **static schedules** are known when the agent is authored;
- **self-scheduled wake-ups** are chosen while the agent is working.

FastAgent v0.17.1 supports both without introducing a workflow language. A schedule or wake-up eventually becomes the same operation as every other trigger: one call to `agent.invoke(scope, prompt)`.

## Two kinds of time

Use a static schedule when the author knows the recurring rule:

```text
Every weekday at 09:00, summarize the previous day.
```

Use `wake` when the model discovers the follow-up time during a turn:

```text
The deploy has started. Check it again in ten minutes.
```

The difference is ownership. A file under `schedules/` is reviewed and versioned with the repository. A wake-up is mutable runtime state attached to the session that created it.

Neither is a deterministic workflow. The clock supplies a prompt; the agent still chooses tools and steps. If a process requires a fixed state machine, compensation, and exactly prescribed retries, put FastAgent behind a workflow engine rather than encoding the process in prose.

## Create a static schedule

Start from a FastAgent workspace and add a TypeScript file:

```ts
// fastagent/schedules/daily-operations.ts
import { defineSchedule } from "@fastagent-sh/fastagent";

export default defineSchedule({
  cron: "0 9 * * 1-5",
  tz: "America/New_York",
  prompt: [
    "Review the previous day's failed jobs.",
    "Summarize the three most important failures and their likely owners.",
    "Send the result to Telegram chat -1001234567890.",
  ].join(" "),
});
```

The filename is the schedule name: `daily-operations`. The scheduler derives a stable session from that name, so recurring runs can retain their own history without sharing a chat session.

List the schedules FastAgent found:

```bash
fastagent schedule list
```

Run one immediately without waiting for the cron slot:

```bash
fastagent fire daily-operations
```

`fire` is the safest way to debug the prompt and tools. It exercises the schedule now without pretending that the real cron slot has occurred.

The schedule runs while `fastagent dev` or `fastagent start` is serving. On a resident host, the in-process scheduler claims a slot before invoking it. After downtime it catches up one overdue occurrence, not an unbounded backlog of every missed tick.

## Deliver the result through a tool

A scheduled invocation has no incoming chat request. There is nothing for a channel adapter to reply to, so returning a polished final answer does not automatically put that answer in Telegram, Slack, or Feishu.

Delivery must be a tool. For example:

```bash
fastagent add telegram
```

The Telegram onboarding scaffolds an outbound send tool. The schedule prompt must name the destination chat ID because there is no `[telegram: chat ...]` envelope on a clock-triggered turn.

This separation prevents a common mistake: treating the scheduler as a hidden broadcast system. The scheduler owns time and invocation; a tool owns a side effect in an external service.

The same rule applies to files and databases. A daily report that should be stored in S3 needs an S3 write tool. A check that should only appear in logs needs no delivery tool at all.

Be careful when reusing a channel’s send tool inside an ordinary chat turn. The channel already delivers the final reply. Calling the outbound send tool as well usually posts the answer twice. Use the tool for out-of-band work such as schedules, wake-ups, or an explicit request to send somewhere else.

## Let the agent schedule its own follow-up

Enable self-scheduling in `fastagent/fastagent.config.mjs`:

```js
export default {
  model: "provider/model-id",
  selfSchedule: true,
  http: { port: 8787 },
};
```

When serving starts, FastAgent mounts two built-in tools:

- `wake` records a future one-shot or recurring invocation;
- `unwake` cancels one by its returned ID.

The wake-up is persisted under the state root and belongs to the session that requested it. A useful persona rule is explicit about when to use it:

```text
When a task has started but its result will only be knowable later, use wake to
schedule one follow-up. State what will be checked. Do not create polling loops
more frequently than the deployment policy allows. Cancel obsolete wake-ups.
```

A deployment assistant can now do this in one turn:

1. start a deployment through a tool;
2. call `wake` for ten minutes later with “check deployment 8472 and report its final state”;
3. finish the current turn;
4. receive a new invocation in the same session when the wake-up becomes due.

Persisting the wake-up is necessary but not sufficient. Something still needs to wake the compute at the requested time. That depends on the host.

## Inspect schedule history

Time-triggered failures are easy to miss because no person is waiting on the request. FastAgent records static schedule runs in the state root and exposes them through the CLI:

```bash
fastagent schedule history daily-operations
```

Use history to answer:

- Did the slot fire?
- Did the agent complete or fail?
- Was a run skipped because the schedule changed?
- Is the problem invocation, model work, or downstream delivery?

Also inspect the ordinary process logs. Schedule history is an audit of runs, not a replacement for model, tool, and transport diagnostics.

For self-scheduled work, retain the wake ID returned by the tool when a later turn might cancel it. An agent that creates anonymous wake-ups faster than they fire is building an invisible queue. FastAgent applies minimum delay, frequency, and per-session limits, but the author should still define sensible behavior.

## How clocks map to deployment targets

Time exposes an important difference between resident servers and request-activated compute.

### Docker, Fly.io, and Railway

A local Docker host or another always-running Node process can keep the scheduler in memory and read persisted wake-ups from its state directory.

Fly.io can suspend request-driven services, but a clock has no inbound request at its firing instant. A deployment with cron, wake, or an outbound long connection needs at least one running machine. FastAgent’s deploy preflight detects these structural requirements and refuses an incompatible scale-to-zero configuration.

Railway’s sleeping behavior is controlled outside the generated config. Do not enable sleeping for a service expected to fire its own local clocks.

### AWS Bedrock AgentCore

AgentCore has no permanently resident process for FastAgent’s local timer. The generated target translates supported static cron rules into [Amazon EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html) resources.

Each EventBridge delivery includes the scheduled slot timestamp. FastAgent uses that slot as an idempotency key before invoking the schedule, because EventBridge delivery is at least once.

With `selfSchedule: true`, pending wake-ups created through the shared webhook/schedule ingress are mirrored into self-deleting one-time EventBridge schedules. The one-time rule invokes the forwarder, which wakes the fixed ingress Runtime session, and the ordinary wake pump fires the due entry.

A wake-up created inside an unrelated direct `InvokeAgentRuntime` session is outside that shared alarm wiring. It remains in that direct session’s storage and can fire only while that session’s compute happens to be awake.

AgentCore and traditional cron also use different expression dialects. FastAgent translates only expressions it can represent without changing meaning. Unsupported combinations are refused at deploy time rather than silently dropped.

## Failure and retry semantics

A clock tells you when an attempt should begin. It does not make tool execution exactly once.

For a static schedule, FastAgent claims the slot before invoking the agent. A duplicate delivery of the same external slot should not start the same scheduled run twice. That protects the invocation boundary, but a process failure after a side-effecting tool call can still leave an ambiguous outcome.

For a one-shot wake-up:

- if the target session is busy before the wake turn starts, FastAgent defers the wake because no work began;
- after a turn starts, a general automatic replay would be unsafe because tools may already have produced side effects;
- recurring wake-ups re-arm through persisted state and the host-specific alarm path.

Design tools accordingly. A “create invoice” tool should accept an application idempotency key. A “send status message” tool may intentionally allow duplicates but include the run timestamp. A “check deployment” tool should be read-only.

EventBridge itself provides at-least-once delivery and retry controls. That does not convert a model-directed sequence of API calls into an exactly-once transaction.

## When to use a workflow engine instead

Use FastAgent schedules and wake-ups when time supplies another prompt and the agent can safely choose what happens next:

- periodic summaries;
- reminders;
- read-only monitoring;
- delayed follow-ups;
- low-risk delivery through idempotent tools.

Use a workflow or queue above FastAgent when the process requires:

- a durable task record independent of conversation state;
- fixed step ordering;
- per-step retries and compensation;
- human approval gates with explicit state;
- exactly defined idempotency across several services;
- routing work to multiple workers or regions.

That workflow can still call `agent.invoke` for the steps that need model judgment. The boundary stays clear: the workflow owns deterministic progress; the agent owns reasoning inside one step.

The versioned [quickstart schedule section](https://github.com/fastagent-sh/fastagent/blob/v0.17.1/docs/quickstart.md#8-run-on-a-clock), [deployment reference](https://github.com/fastagent-sh/fastagent/blob/v0.17.1/docs/deploy.md), and [FastAgent source](https://github.com/fastagent-sh/fastagent) contain the complete shipped behavior.
