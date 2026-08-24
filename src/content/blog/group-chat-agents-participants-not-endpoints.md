---
title: "Group-chat agents should behave like participants, not endpoints"
date: 2026-08-24
description: "Derive when an agent should speak, where it should answer, and what it should remember from the social structure of the room."
tags:
  - channels
  - group-chat
  - design
  - serving
---

Most chat integrations are implemented as APIs and experienced as colleagues. That mismatch explains a large share of bad bot behavior.

An endpoint receives a request, returns a value, and forgets the exchange. A participant hears a room, speaks when addressed, answers where the question was asked, and remembers the conversation shared by that place.

FastAgent v0.17.1 uses the second model for Slack, Feishu/Lark, and Telegram. The implementation differs by platform, but three rules stay stable:

1. listening and speaking are separate decisions;
2. an answer belongs where the question was asked;
3. memory follows the conversation place, not the individual user.

These rules matter beyond FastAgent. They are a way to reason about any agent that enters a collaborative room.

## The participant axiom

Start from one statement:

> The agent is a participant in the room. Its interaction rules should follow how people use that room, not the mechanics of an API request.

Compare the two models:

| | Endpoint | Participant |
| --- | --- | --- |
| Identity | callable service | member of the room |
| Invocation | each request calls it | people address it |
| Context | request payload | what happened in this place |
| Output | returned value | answer in the shared conversation |
| Concurrency | independent requests | one causal conversation at a time |

Neither model is always correct. A slash command can intentionally be an endpoint. The problem begins when a bot is presented as a teammate while retaining endpoint defaults.

A participant-oriented default can still expose custom routing for an endpoint-shaped product. Defaults and capability are separate questions.

## Listening is not speaking

A useful colleague can hear a discussion without interrupting every sentence. Chat agents need the same distinction:

> Hear what the platform delivers. Speak only when the social context says the agent was addressed.

In a group’s main timeline, that usually means requiring an explicit mention. Messages that do not summon the agent can still become context for the next answered turn if the deployment has permission to receive them.

This creates two legitimate postures:

| Posture | Platform visibility | Experience |
| --- | --- | --- |
| Context-aware participant | receives ordinary group messages | hears discussion, answers when summoned |
| Mention-only tool | receives only mentions | sees only the message that called it |

The context-aware posture is more useful and more privileged. On Feishu, for example, it requires the tenant-admin-approved `im:message.group_msg` scope. The mention-only posture is the least-privilege alternative and should remain a first-class choice.

Visibility does not grant permission to answer. A platform scope decides what the bot can hear; routing policy decides what should become an agent turn.

## When to answer

People use names differently in a crowd and in a two-person exchange. A practical rule is:

> Answer a bare message only when the agent already participates in that conversation place and has not heard a second human there. Otherwise require an explicit mention.

This yields predictable behavior:

| Place | People heard speaking | Default behavior |
| --- | ---: | --- |
| Direct message | one human | answer |
| Group main timeline | many possible participants | require mention |
| Thread the agent has joined | zero or one human | answer a bare continuation |
| Joined thread after a second human speaks | at least two humans | require mention again |

The final row prevents a common failure: an agent answers one question in a thread, then barges into every later message of a three-way human discussion.

“People heard” is deliberately weaker than “actual membership.” Collaboration APIs rarely provide a complete, current roster of who is participating in one conversation. Reading thread history on every webhook adds latency, pagination, failure modes, and still does not prove who silently remains present.

FastAgent records what the channel observed. A thread joined before the current deployment, or before its participation state was lost, requires one mention to re-enter. That is visible and self-correcting. Claiming complete membership from partial platform data would be more confident and less reliable.

Mentions also need structural interpretation. A message mentioning another person is not automatically addressed to the agent. Pasted `@bot` text inside code is not a summon when the platform provides a real mentions array. Routing should use platform entities, not string search.

## Where to answer

An answer should appear where the question was asked:

| Asked in | Answer in |
| --- | --- |
| Direct message | that direct conversation |
| Group main timeline | the main timeline, attached or quoted when the platform permits |
| Thread or topic | that thread or topic |

Do not silently relocate an answer because the model might produce a long response. Automatic thread creation introduces a hidden heuristic: users stop knowing where to look.

Platforms provide different attachment primitives, so “answer in place” does not look identical everywhere:

- Feishu and Telegram can quote a message in the room.
- Slack has no equivalent quote primitive for this interaction, so replying in place means opening or continuing a thread under the user’s message.
- A person who wants side work to proceed independently can explicitly open a thread.

The invariant is audience and location, not identical wire behavior.

## What a room should remember

Conversation memory belongs to the place where people share it:

- a direct chat has one continuous memory;
- a group room has memory shared by the people in that room;
- a thread has its own memory, anchored to the side conversation.

A session per user inside one group breaks ordinary collaboration. If Alice asks a question and Bob follows up on the answer, Bob should not enter a new conversation that cannot remember what everyone just saw.

A new session for every mention is equally disruptive. It gives the agent a form of anterograde amnesia: every answer exists, but none becomes part of the next turn.

FastAgent therefore maps sessions to conversation places. The exact key is platform-specific, but the rule is stable. On Feishu/Lark, a chat and each `thread_id` are separate places. On Slack, the thread used to attach the answer is the place. Telegram topics use their topic identifier when available.

A quoted or replied-to message may predate the session. The channel should load that referent as explicit input when the platform allows it. A quote is the user pointing at evidence; silently dropping it because it is not already in transcript memory changes the request.

## Why the place is the concurrency unit

Session identity also defines which turns must be ordered.

One conversation is causal. A second message may refer to the first answer, so two turns writing the same session cannot safely execute from the same stale transcript and be concatenated later.

Different places can run independently. A room and a thread, or two separate threads, can proceed in parallel because users already expressed that separation in the interface.

This leads to a useful concurrency rule:

- turns in one place serialize;
- turns in different places may run concurrently.

FastAgent’s stateful chat channels queue per session. In a busy Feishu room, a second summon waits and receives a visible queued card. Opening a thread creates another place and allows separate work to proceed.

Parallel turns inside one conversation would create branches without a reliable convergence rule. A model might infer whether two requests are causally independent, but the user has already provided a clearer signal: the place in which they sent the message.

## How the rule maps to Slack, Feishu, and Telegram

The participant model is platform-neutral; the implementation is not.

### Feishu and Lark

A group summon is answered in the room with a quoted streaming card. A direct chat keeps one continuous session. A thread has a separate session and admits bare continuations while the agent participates and has heard no second human.

The context-aware group posture requests broad group-message delivery. Mention-only omits that sensitive scope and cannot buffer discussion the platform never sends.

### Slack

A channel answer becomes a thread reply because Slack has no quote primitive for this case. That thread becomes the session. Slack’s Agents surface also shapes direct-message conversations as assistant threads rather than one undifferentiated DM timeline.

The summon rule still follows participation: a bare thread continuation is accepted until a second human is heard, then explicit mention is required again.

### Telegram

Telegram supplies useful parent-message information directly in updates. A reply to the bot can be recognized without fetching history, and topic IDs provide conversation places. This weaker, event-local knowledge is often simpler and more reliable than pretending to have a complete room roster.

The [Telegram Bot API](https://core.telegram.org/bots/api) and [Slack Events API](https://api.slack.com/apis/events-api) expose different primitives. A shared design should adapt to those primitives rather than flattening them into one generic “chat ID + user ID” formula.

## The cost of weaker platform signals

A participant model must state what it cannot know.

- If the agent did not receive ordinary group messages, it cannot have context for them.
- If participation state is lost, an old thread needs one mention to re-enter.
- If a sender event lacks a stable human identifier, conservative routing may require mentions earlier.
- If a platform does not expose a quoted message’s sender or body, recognizing “reply to the bot” may require an extra read or a durable sent-message index.
- Observations can accumulate, but the absence of speech does not prove someone left.

The error directions are not equal. Over-counting participants makes the agent ask to be named; under-counting makes it speak into a crowd. Conservative defaults should fail toward silence.

This is also why broad claims such as “the bot understands the room” are misleading. It understands only the events and referents the platform delivered, persisted under the deployment’s state policy.

## Design the social contract before the webhook

Webhook verification, event parsing, and message rendering are implementation work. They should follow a prior decision about the agent’s social contract:

1. What can it hear?
2. What explicitly addresses it?
3. When does a two-party continuation become a group discussion?
4. Where will the answer appear?
5. Which place owns memory and ordering?
6. What happens when participation state is missing?

Answer those questions first and the session keys, queues, and routing predicates become derivable. Start with API mechanics and the product accumulates switches that couple unrelated behavior: thread placement changes memory, a permission toggle changes speaking, or a per-user session destroys room continuity.

FastAgent’s full derivation is public in the versioned [participant model design note](https://github.com/fastagent-sh/fastagent/blob/v0.17.1/docs/design/participant-model.md), with channel behavior in the [v0.17.1 channel guide](https://github.com/fastagent-sh/fastagent/blob/v0.17.1/docs/channels.md). The implementation is MIT-licensed in the [FastAgent repository](https://github.com/fastagent-sh/fastagent).
