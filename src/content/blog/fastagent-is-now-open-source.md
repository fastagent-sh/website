---
title: FastAgent is now open source
date: 2026-07-10
excerpt: FastAgent turns an existing agent directory into a live service without asking you to rewrite it into a new framework.
tags:
  - announcement
  - release
featured: true
---

Coding agents made it cheap to build useful agent directories. They can carry identity, project context, skills, tools, and the accumulated knowledge that makes an agent useful. But most of those agents still stop at the terminal.

FastAgent is the serving layer for what comes next. Today, it is open source under the MIT license and available on npm as [`@fastagent-sh/fastagent`](https://www.npmjs.com/package/@fastagent-sh/fastagent).

## Keep the agent you already have

FastAgent does not introduce another agent-authoring format. The directory remains the definition:

```text
agent/
├── persona.md
├── AGENTS.md
├── skills/
├── tools/
├── channels/
├── schedules/
└── fastagent.config.mjs
```

Point FastAgent at that directory, choose a model, and serve it. Existing files stay inspectable, editable, and versioned with the rest of your project.

## From one directory to real triggers

The same agent can be:

- embedded behind a route in an existing application;
- exposed through HTTP and server-sent events;
- connected to GitHub pull requests and webhook events;
- run as a Telegram bot;
- invoked on a cron schedule or by a self-scheduled wake-up;
- connected to another service through a custom channel.

Your application still owns authentication, users, data, routing, and policy. FastAgent supplies the small serving layer around the agent.

## A small contract at the center

FastAgent is centered on the engine-neutral Agent Handler contract:

```ts
invoke(scope, prompt) => AsyncIterable<AgentEvent>
```

Channels consume that contract rather than depending on a specific model engine. The included reference implementation is built on [pi](https://pi.dev), while the contract leaves engines, models, and hosts replaceable.

The normative contract is public in the [Agent Handler SPEC](/docs/spec/).

## Start with a coding agent

The shortest onboarding path is itself agent-native. Give your coding agent this prompt:

```text
Read https://fastagent.sh/start.md, inspect this project, and help me serve its existing agent definition with FastAgent without rewriting it.
```

It will inspect the existing layout before changing it, ask before choosing credentials, and use commands that can be verified non-interactively.

Prefer to work manually? Follow the [quickstart](/docs/quickstart/).

## Built in the open

The source, issue tracker, design contract, and contribution workflow live at [github.com/fastagent-sh/fastagent](https://github.com/fastagent-sh/fastagent). FastAgent is pre-1.0, and the public Agent Handler contract is the stable design center while the package API continues to tighten.

Vibe first. Then FastAgent.
