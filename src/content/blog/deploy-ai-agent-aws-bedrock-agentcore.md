---
title: "Deploy a stateful AI agent to AWS Bedrock AgentCore with FastAgent"
date: 2026-08-18
description: "A complete path from a file-defined TypeScript agent to AgentCore Runtime, including arm64 containers, webhook ingress, EventBridge schedules, S3-backed state, logs, redeploys, and the limits that still matter."
tags:
  - aws
  - agentcore
  - deploy
  - serving
---

Getting a container to start is the easy part of deploying an agent. The harder questions arrive immediately after it starts:

- How does a GitHub, Telegram, Slack, or Feishu webhook reach a Runtime that is invoked through an AWS API?
- Who fires cron when no process is resident to keep a timer alive?
- What keeps conversation and channel state after a new Runtime version resets the managed session filesystem?
- How do you move an active ingress session to the new image instead of leaving it on the old one?

This guide deploys a file-defined FastAgent agent to [Amazon Bedrock AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html) and answers those questions. The short path is one command:

```bash
fastagent deploy agentcore --run
```

The useful part is understanding what that command builds, which state it makes durable, and where the boundary remains.

> **Scope:** this article describes the container-based AgentCore microVM target shipped in FastAgent v0.17.1. AgentCore is evolving quickly; the linked AWS pages are the source of truth for current platform behavior, supported Regions, quotas, and pricing.

## The result

We will start with an ordinary FastAgent workspace and end with:

- a `linux/arm64` image in Amazon ECR;
- an AgentCore Runtime implementing `POST /invocations` and `GET /ping`;
- a CloudFormation stack containing the Runtime, IAM roles, webhook forwarder, and schedules;
- a Lambda Function URL for route-based webhooks;
- EventBridge Scheduler rules for static cron jobs and agent-created wake-ups;
- an S3 snapshot that preserves the shared ingress state across Runtime version updates;
- direct programmatic invocation through `InvokeAgentRuntime` with an SSE response;
- Runtime and forwarder logs available through two FastAgent commands.

There are two possible shapes:

| Agent definition | Generated topology |
| --- | --- |
| Direct `InvokeAgentRuntime` only | Runtime + ECR image. No public Function URL and no shared S3 state snapshot. |
| Any webhook channel, schedule, or `selfSchedule` | Runtime + forwarder Lambda/Function URL + S3 state snapshot, with EventBridge resources when clocks are present. |

That distinction matters. A pure API invocation gets AgentCore's per-session isolation, but its FastAgent state is not copied into the shared cross-deploy snapshot. The webhook and schedule ingress path is the stateful service topology described through most of this article.

## Why AgentCore is different from a normal container host

AWS supports custom agents and frameworks, but the container has to meet the [AgentCore Runtime HTTP contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-http-protocol-contract.html): listen on `0.0.0.0:8080`, expose `/invocations` and `/ping`, and run as ARM64. The [AWS custom-container walkthrough](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/getting-started-custom.html) shows the underlying ECR, image, Runtime, and invocation steps.

FastAgent adds a serving topology around that contract because an agent service needs more than one request endpoint.

### Runtime invocation is not a webhook origin

Clients call the SigV4-protected [`InvokeAgentRuntime` API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html). AgentCore does not expose every route inside your container as an arbitrary public webhook URL. Telegram cannot SigV4-sign an `InvokeAgentRuntime` request, and GitHub needs to send its original body and signature headers to a stable HTTPS endpoint.

FastAgent therefore places a small Lambda Function URL in front of route channels. The Lambda forwards a byte-preserving envelope to `/invocations`; the existing channel adapter then performs the same secret-token or signature verification it performs on Docker, Fly.io, or Railway.

### A Runtime session is isolated compute, not a permanent server

AgentCore routes each `runtimeSessionId` to an isolated microVM. AWS documents the isolation and lifecycle in [Use isolated sessions for agents](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-sessions.html). A stopped session can be resumed on fresh compute, but process memory is not the source of continuity.

FastAgent already uses a per-invocation agent contract:

```ts
invoke(scope, prompt) => AsyncIterable<AgentEvent>
```

A turn reopens durable conversation state instead of requiring the previous turn's JavaScript object to remain alive. That makes the Runtime's compute model a natural fit.

### An in-process cron timer cannot wake stopped compute

A schedule is useful precisely when no user is present to make an inbound request. On a resident host, FastAgent can keep an in-process scheduler running. On AgentCore, static schedules are translated into [Amazon EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html) rules. A schedule invokes the forwarder Lambda, which invokes the fixed ingress Runtime session.

The same principle applies to `selfSchedule: true`. A pending `wake` becomes a one-time EventBridge schedule. Its invocation wakes the ingress session, and the normal FastAgent wake pump fires the due turn.

### Managed session storage is not cross-version durability

AgentCore managed session storage survives stop/resume, but AWS explicitly documents two reset conditions in [File system configurations for AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-filesystem-configurations.html): 14 days without invocation and a Runtime version update.

A deployment creates a new Runtime version, so treating `/mnt/state` as the only durable store would erase FastAgent sessions, channel deduplication state, accepted-turn records, and pending wake-ups on every release.

FastAgent uses `/mnt/state` as the fast local filesystem and keeps the durable ingress copy as one versioned S3 object. We will return to the exact state model after deploying.

## 1. Prepare the local agent

Prerequisites:

- Node.js 22.19 or newer;
- FastAgent CLI;
- AWS CLI v2 with working credentials;
- an AWS Region where AgentCore is available — check the current [supported Regions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html);
- Docker with Buildx;
- permission to create or update ECR, S3, CloudFormation, IAM, AgentCore Runtime, Lambda, and EventBridge resources used by the generated stack.

Verify the infrastructure tools before doing any work:

```bash
aws sts get-caller-identity
aws configure get region
docker version
docker buildx version
```

Then create an agent:

```bash
npm i -g @fastagent-sh/fastagent
fastagent init agentcore-demo
cd agentcore-demo
fastagent info
```

The default layout is:

```text
agentcore-demo/                 # workspace and container build context
└── fastagent/                  # agent definition
    ├── persona.md
    ├── skills/
    ├── tools/fetch-url.ts
    ├── fastagent.config.mjs
    ├── package.json
    └── .secrets/
```

Run it locally:

```bash
fastagent dev
```

A fresh agent has no model preset. The first interactive run lets you choose a model and authenticate, then writes the selected model into `fastagent/fastagent.config.mjs`. This persistence is important: a local `--model` flag or `FASTAGENT_MODEL` override is builder-local and does not become a deployment default. `deploy --run` gates before creating infrastructure when the config has no model.

With the local server running, verify one turn:

```bash
curl -N -X POST localhost:8787/invoke \
  -H 'content-type: application/json' \
  -d '{"session":"local-check","text":"Summarize https://example.com in two bullets"}'
```

The response is the same SSE event stream the AgentCore adapter later returns through `InvokeAgentRuntime`.

## 2. Add a real ingress path

You can deploy the direct API shape now. To exercise webhook ingress, schedules, and shared cross-deploy state, add a route channel. Telegram is a compact example:

```bash
fastagent add telegram
```

The onboarding flow writes a route module under `fastagent/channels/`, channel secrets under `fastagent/.secrets/`, and a `telegram-send` tool. Test it locally before involving AWS:

```bash
fastagent dev --tunnel
```

Now add a daily status schedule:

```ts
// fastagent/schedules/daily-status.ts
import { defineSchedule } from "@fastagent-sh/fastagent";

export default defineSchedule({
  cron: "0 9 * * *",
  tz: "America/New_York",
  prompt:
    "Fetch the current GitHub Status summary, reduce it to three bullets, " +
    "and send it to Telegram chat <YOUR_CHAT_ID>.",
});
```

Run the schedule immediately without waiting for 09:00:

```bash
fastagent fire daily-status
```

A schedule only invokes the agent. Delivery still belongs to a tool, which is why the prompt names both the destination and the target chat. If you do not need Telegram, use another route channel or omit this section; the AgentCore deployment mechanism is the same.

## 3. Generate the deployment before running it

First generate the artifacts and inspect the runbook:

```bash
fastagent deploy agentcore
```

In the default workspace layout, this writes:

```text
agentcore-demo/
├── .dockerignore
└── fastagent/
    ├── Dockerfile
    ├── agentcore.template.yaml
    └── lambda/index.js
```

The generated CloudFormation template uses the first-class [`AWS::BedrockAgentCore::Runtime`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html) resource. It also declares only the topology implied by the definition: route channels add webhook ingress, schedules add EventBridge rules, and `selfSchedule` adds one-time wake-alarm wiring.

Generation has no cloud side effects. This separation is useful for review: security and infrastructure teams can inspect the exact IAM policies, Runtime environment, storage, and public ingress before anyone runs `aws cloudformation deploy`.

The generated architecture for our Telegram-plus-schedule example is:

```text
Telegram webhook
      │ public HTTPS
      ▼
Lambda Function URL ──► forwarder Lambda
                             │ SigV4 InvokeAgentRuntime
EventBridge schedule ────────┤
                             ▼
                    AgentCore Runtime session
                    POST /invocations
                    GET  /ping
                             │
                  FastAgent channel / schedule
                             │
             /mnt/state ◄────┴────► S3 state snapshot

ECR image ────────────────────────► Runtime versions
CloudWatch ◄─────────────────────── Runtime + Lambda logs
```

The forwarder is transport, not a second agent. It does not parse Telegram updates or execute model work. It preserves the request body and headers, invokes the Runtime, and re-emits the channel's actual HTTP response. Channel verification remains inside the channel adapter.

## 4. Deploy end to end

When the generated files look right, run:

```bash
fastagent deploy agentcore --run
```

`--run` performs the following ordered steps:

1. verifies AWS identity and resolves the Region;
2. verifies Docker, the daemon, and Buildx;
3. checks the model and every required channel or tool secret before cloud side effects;
4. creates or reuses `fastagent/<workspace-name>` in ECR;
5. creates or reuses the deployment bucket when a forwarder is required;
6. blocks public access on the bucket, enables versioning, and applies lifecycle handling to old snapshot versions;
7. builds `linux/arm64` locally and pushes it with a unique image tag;
8. deploys the CloudFormation stack with `CAPABILITY_IAM`;
9. reads the Runtime ARN and forwarder URL from stack outputs;
10. checkpoints and stops an old ingress session during a redeploy;
11. probes the new serving path, including state restore and channel construction;
12. registers automatable webhooks and prints the remaining platform-console steps.

AgentCore's custom-container requirements are why this target builds locally instead of handing source to a remote builder. AWS requires ARM64, and the image has to be present in your ECR repository. FastAgent uses `docker buildx build --platform linux/arm64 ... --push` under the hood.

Secrets do not ride in the image or in the process argument list. `--run` resolves local values, writes a temporary owner-only CloudFormation parameter file, and maps them into `NoEcho` parameters. A locally stored model login is carried as an absent-only `auth.json` seed; an already-rotated credential restored from durable state wins over that deployment-time seed.

The deploy command is resumable. ECR repositories, buckets, and converged stack resources are reused. A failed first CloudFormation create that ends in `ROLLBACK_COMPLETE` is removed before retrying, while the state bucket remains outside the stack.

## 5. Invoke the deployed agent directly

The stack outputs include `RuntimeArn`. Call it with the AWS CLI:

```bash
aws bedrock-agentcore invoke-agent-runtime \
  --agent-runtime-arn <RuntimeArn> \
  --runtime-session-id "my-conversation-000000000000000000" \
  --payload '{"kind":"invoke","session":"cli","text":"Summarize https://example.com"}' \
  --cli-binary-format raw-in-base64-out \
  /dev/stdout
```

AWS requires a Runtime session ID of at least 33 characters. Reuse that ID when you want AgentCore to route later calls to the same isolated session. The `InvokeAgentRuntime` operation supports streaming responses; FastAgent returns its normal SSE stream.

There are two session identifiers in the example, and they have different jobs:

- `--runtime-session-id` selects the AgentCore microVM and its filesystem boundary;
- the payload's `session` selects the FastAgent conversation record used by `invoke(scope, prompt)`.

For direct invocations, your application must own the authenticated user-to-session mapping. AWS explicitly notes that AgentCore does not enforce that relationship for you. Do not let an untrusted client choose another user's Runtime or FastAgent session ID.

## 6. Understand the webhook path

AgentCore's direct data plane is IAM/SigV4. Most webhook providers need an ordinary public HTTPS URL, so the generated forwarder translates between the two surfaces:

```text
original webhook
  method + path + query + headers + raw body
          │
          ▼
public Lambda Function URL
          │
          ▼
{ kind: "webhook", method, path, headers, bodyB64 }
          │
          ▼
InvokeAgentRuntime on one fixed ingress session
          │
          ▼
FastAgent reconstructs Request and runs the normal channel route
```

The fixed ingress Runtime session is intentional. FastAgent's file-backed channel state is single-writer, while individual chats, rooms, and threads remain separate FastAgent sessions inside that state root.

The Function URL uses public access because Telegram, GitHub, Slack, and Feishu cannot authenticate with AWS IAM. Public reachability does not mean accepting unsigned events: the original headers and bytes are reconstructed before the normal channel handler runs, so GitHub HMAC, Slack signatures, Telegram's secret token, and Feishu/Lark verification continue to apply.

There is a host-specific payload ceiling. AWS lists a 6 MB synchronous Lambda request limit in the [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html). Base64 expansion and envelope overhead reduce FastAgent's accepted original webhook body to about 4.4 MB. A channel that accepts a larger body on a resident host cannot receive that full size through this topology.

## 7. Understand the clock path

A static FastAgent schedule normally runs from an in-process clock. The AgentCore target instead translates supported five-field cron expressions into EventBridge Scheduler resources:

```text
schedules/daily-status.ts
          │ deploy-time translation
          ▼
AWS::Scheduler::Schedule
          │ scheduled slot timestamp
          ▼
forwarder Lambda
          │
          ▼
{ kind: "schedule-fire", name: "daily-status", slot: "..." }
          │
          ▼
FastAgent slot claim → agent turn
```

EventBridge Scheduler provides at-least-once delivery. FastAgent uses the scheduled slot timestamp as an idempotency key before invoking the agent, so a duplicate delivery for the same slot does not start the same scheduled turn twice.

Cron dialects differ. FastAgent translates day-of-week numbering and EventBridge's day-of-month/day-of-week rules only when the result is unambiguous. An expression it cannot represent is refused during deployment with the schedule name and reason; it is never silently omitted.

With `selfSchedule: true`, every pending ingress-side wake-up is mirrored into a self-deleting one-time EventBridge schedule. A wake created inside a separate direct `InvokeAgentRuntime` session is different: it lives in that direct session's isolated storage and has no shared alarm wiring, so it can fire only while that session remains awake.

## 8. Understand what “stateful” means here

This is the part most likely to be misunderstood.

AgentCore managed session storage gives `/mnt/state` normal filesystem semantics and preserves it across stop/resume for the same Runtime version. It is still reset on a Runtime version update and after 14 idle days. FastAgent therefore uses two layers:

1. **Local session filesystem:** `/mnt/state`, fast and available to the active ingress microVM.
2. **Cross-deploy ingress snapshot:** one gzip-compressed object under `state/snapshot.json.gz` in the deployment S3 bucket.

On the first trusted ingress invocation in a process, FastAgent restores the snapshot before constructing channels. When work settles, it snapshots the state root again. The snapshot includes:

- FastAgent JSONL conversation sessions;
- channel delivery deduplication and accepted-turn records;
- buffered chat context;
- schedule history and pending wake-ups;
- the deployed model credential store.

The last item changes the security classification of the bucket. FastAgent places `.secrets/auth.json` inside the snapshotted state tree so an OAuth refresh performed on the Runtime survives the next deployment. The generated deploy flow blocks public access and enables versioning, but you should still treat the bucket as credential storage: restrict account access, audit it, and apply your organization's encryption and retention requirements.

The bucket is deliberately outside CloudFormation. Deleting the stack does not delete the agent's memory or credential snapshot. That protects state from accidental stack replacement, but it also means cleanup is your responsibility. Delete the bucket and the ingress agent starts blank on the next deploy.

### Direct API sessions are a separate durability tier

A direct `kind: "invoke"` call runs in the Runtime session ID supplied by the caller. It does not receive the forwarder's presigned S3 snapshot capabilities and does not read or overwrite the shared ingress snapshot. Its AgentCore managed session storage may survive a stop/resume, but AWS resets that storage on a Runtime version update or after its documented idle expiry.

So “state survives deploys” applies to the generated webhook/schedule ingress session. It is not a blanket claim about every direct Runtime session.

## 9. Redeploy without leaving the live session behind

AgentCore versions Runtimes automatically. AWS explains in [Runtime versioning and endpoints](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agent-runtime-versioning.html) that the `DEFAULT` endpoint moves to the latest version, while a session already running can continue on the code it started with until that compute terminates.

That creates a subtle deployment failure mode: CloudFormation succeeds, but an active chat keeps answering from the previous image.

FastAgent's `--run` path handles the shared ingress session in this order:

1. send a checkpoint envelope to push current state to S3;
2. stop the fixed ingress Runtime session;
3. invoke a protected probe through the forwarder;
4. restore state and construct channels on fresh compute;
5. register webhooks only after the probe succeeds.

A turn in flight when the session is stopped is interrupted. Telegram, Slack, and Feishu/Lark persist accepted turn intent before acknowledging the platform and can replay it at least once after recovery. GitHub's post-ack work has no durable replay. FastAgent does not claim universal exactly-once tool execution.

Use a unique image tag for every deployment. Re-pushing a mutable tag does not change the CloudFormation `ImageUri` value, so it may not create the Runtime version you expected. `--run` generates a unique tag automatically.

## 10. Operate it without hunting through CloudWatch

Runtime application logs and forwarder transport logs are separate sources.

Tail the agent process:

```bash
fastagent logs agentcore --follow
```

Tail webhook and schedule ingress:

```bash
fastagent logs agentcore --source forwarder --follow
```

The first command derives the stack from the workspace, reads its Runtime ARN, discovers the per-endpoint log group, and tails the container's stdout/stderr. The second selects the forwarder Lambda log group. These commands perform discovery and `aws logs tail`; they do not replace [AgentCore observability](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-observability.html) or change `FASTAGENT_LOG_LEVEL`.

A useful debugging split is:

- no Function URL request appears: inspect provider configuration or Lambda URL access;
- the forwarder logs a Runtime error: inspect IAM, session provisioning, or Runtime health;
- the Runtime receives the envelope but rejects it: inspect channel signatures, secrets, and route configuration;
- the channel acknowledges but no answer arrives: inspect the background turn, model credentials, and channel delivery logs.

## 11. Idle behavior and cost

AWS lifecycle settings default to a 15-minute idle timeout and an eight-hour maximum lifetime when no values are supplied. The generated FastAgent template sets an explicit 180-second idle timeout and the eight-hour microVM ceiling. See [Configure AgentCore lifecycle settings](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-lifecycle-settings.html) for the current ranges and defaults.

Why shorten the idle tail? The [AgentCore pricing page](https://aws.amazon.com/bedrock/agentcore/pricing/) explains that microVM CPU and memory are consumption-based, with memory accounted across the session lifetime and idle CPU not billed when it is doing no work. A shorter idle timeout trades more cold starts for a smaller idle memory tail.

FastAgent's `/ping` reports:

- `HealthyBusy` while a webhook turn, schedule, snapshot upload, or other background work is still active;
- `Healthy` after the deployment is genuinely idle.

It updates `time_of_last_update` only on a real status transition. This keeps long-running background turns alive without accidentally resetting the idle timer on every health poll.

Use AWS's current pricing page and your own traffic profile for estimates. AgentCore Runtime, Lambda, EventBridge, S3, ECR, CloudWatch, model inference, and network transfer are separate cost surfaces.

## 12. Know the current limits

The FastAgent AgentCore target is deliberately narrower than everything AgentCore can host.

- **Container microVM target only.** It does not currently generate AgentCore direct-code deployments or the newer Instances compute topology.
- **FastAgent long-connection channel modules are unsupported.** Slack, Feishu/Lark, and similar integrations must use webhook mode. AgentCore's HTTP contract now supports an optional `/ws` endpoint; FastAgent v0.17.1 does not map its long-connection channel abstraction onto that endpoint.
- **Direct-session state does not cross Runtime versions.** Only the fixed webhook/schedule ingress state is copied to the FastAgent S3 snapshot.
- **No universal exactly-once guarantee.** EventBridge is at least once; stateful chat channels replay accepted turns at least once; side-effecting tools must be idempotent where duplication matters.
- **Webhook bodies are smaller here.** The Lambda Function URL envelope limits original bodies to about 4.4 MB.
- **An ingress redeploy can interrupt a turn.** The checkpoint protects durable intent where the channel has it; it cannot resume arbitrary tool execution from the instruction that was in flight.
- **Generated files can drift from the definition.** Adding a channel, schedule, or `selfSchedule` changes the topology. If a generated `agentcore.template.yaml` is stale, `--run` stops until you regenerate it with `--force`. A hand-owned template is never overwritten.
- **Tools are still trusted deployment code.** AgentCore isolates Runtime sessions, but tools inside one session can access that session's files and whatever the Runtime role permits. Follow AWS's [AgentCore Runtime security best practices](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-security-best-practices.html), enforce user-to-session ownership, and scope IAM to the minimum required resources.

These are deployment semantics, not footnotes. They determine whether AgentCore is the right target.

## When to choose this target

AgentCore is a strong fit when:

- your infrastructure and operations already live in AWS;
- SigV4 invocation and per-session microVM isolation are useful boundaries;
- traffic is intermittent enough for consumption-based compute to matter;
- webhooks and schedules should be represented as AWS resources;
- you want a generated CloudFormation topology you can inspect and take ownership of.

A resident Docker, Fly.io, or Railway deployment is usually simpler when:

- you need an outbound WebSocket connection held continuously;
- one ordinary persistent volume is the durability model you want;
- every programmatic conversation must survive deployments without an external session backend;
- you want a plain public HTTP origin with no forwarder hop.

The purpose of `fastagent deploy agentcore` is not to hide AWS. It is to translate a file-defined agent into the topology AgentCore actually requires, while leaving the generated container and CloudFormation template visible.

Start with generation, inspect the artifacts, then run the deployment:

```bash
fastagent deploy agentcore
fastagent deploy agentcore --run
```

Read the current [FastAgent AgentCore deployment reference](https://github.com/fastagent-sh/fastagent/blob/main/docs/deploy.md#aws-bedrock-agentcore), the [AgentCore Runtime service contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html), and the [FastAgent source](https://github.com/fastagent-sh/fastagent) before adapting the topology for production.
