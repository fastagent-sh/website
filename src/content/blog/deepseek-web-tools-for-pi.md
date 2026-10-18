---
title: "The cheapest web search for a coding agent: DeepSeek tools in pi"
date: 2026-10-18
description: "DeepSeek's Search and Fetch APIs cost ¥5 per 1,000 requests and return summaries written for models. Here is how they plug into pi, what they cost, and where they stop."
tags:
  - pi
  - web-search
  - agents
  - cost
---

An agent that searches the web a hundred times a day is not free. Search APIs bill per request, and the usual rates are $5 to $8 per thousand calls: Brave at $5, Tavily at $5 to $8, Exa at $7. At a hundred searches a day that is $15 to $25 a month for one agent, before it fetches a single page.

DeepSeek prices the same work at ¥5 per 1,000 successful requests, about $0.70. It is not a reseller. DeepSeek runs its own index, returns the ranking with every result, and writes summaries that a model can read. The APIs are two plain JSON endpoints:

```
POST https://api.deepseek.com/v1/tools/search
POST https://api.deepseek.com/v1/tools/fetch
```

This post covers what those endpoints return, how they plug into [pi](https://pi.dev), when they beat the usual providers, and the places where they do not.

![A pi session: a search returns three ranked results, then the paid tools are toggled off and on again](https://cdn.jsdelivr.net/gh/fastagent-sh/pi-deepseek-tools@main/assets/demo.gif)

## Two endpoints, no model call

`POST /v1/tools/search` takes a query, a count between 1 and 50, and a flag for full page text. It returns an array of results. Each one carries a title, a URL, a short snippet, a long summary, the site name, a publish date when known, and two scores: `rerank_score` from 0 to 3 and `authority` from 0 to 4. A result with `rerank_score` of 1.5 or more is documented as a good hit; 3 or more authority is the top band.

`POST /v1/tools/fetch` takes one URL and returns the page as Markdown with its title. Extraction happens on DeepSeek's side, so nothing runs on your machine: no headless browser, no readability pass, no proxy.

Neither call touches a language model. You pay for search and fetch, not for tokens, which also means a tool call costs the same whether the model asked one question or five.

## What comes back is written for a model

Raw search APIs return fragments meant for a person scanning a page. The fields here are aimed at an agent deciding what to do next:

- the `summary` is 600 to 800 characters in the typical case, written to be read whole rather than truncated;
- `rerank_score` folds relevance, authority, and freshness into one number, so an agent can drop weak hits before spending a fetch on them;
- `authority` is a second, slower-moving signal for the same judgement;
- `date` is RFC 3339 UTC when the page declares one, which makes "published after 2025" a filter the agent can apply after the fact.

That is the difference between a list of links and a result an agent can reason about without fetching everything.

## Install it in pi

```
pi install npm:@fastagent-sh/pi-deepseek-tools
```

The package is `@fastagent-sh/pi-deepseek-tools`, published from GitHub Actions with SLSA provenance. It adds two tools, `deepseek_search` and `deepseek_fetch`, and one command, `/deepseek-tools`.

Your DeepSeek key comes from, in order:

1. `DEEPSEEK_API_KEY`;
2. the `deepseek` credential you already have in pi, set with `/login deepseek` or `pi auth`;
3. `deepseekApiKey` inside `web-search.json` in the pi agent directory, the field pi-web-access uses.

If you already use DeepSeek as a model provider in pi, there is nothing to configure.

## Searching

```
deepseek_search {"query": "deepseek v4 release", "count": 5}
```

Five results is the default because ten of them cost about 6.6k tokens of context. Raise `count` for a survey, lower it for a lookup. Pass `includeContent: true` only when you want page text for every hit; for one page, `deepseek_fetch` is cheaper and more precise.

Query operators pass through to DeepSeek unchanged: `site:`, `-site:`, `-"exact phrase"`, `-word`, `lang:zh,en`, `after:2025-01-01`, `before:2026-06-01`. A realistic research query:

```
deepseek_search {"query": "deepseek site:github.com OR site:huggingface.co lang:en after:2025", "count": 10}
```

Queries are limited to 128 Unicode characters, operators included. The package rejects longer ones before sending, rather than letting the API answer with a 400.

## Reading a page

```
deepseek_fetch {"url": "https://api-docs.deepseek.com/zh-cn/guides/search/"}
```

The result is a title and Markdown. Output truncates at 50 KB or 2,000 lines, whichever comes first, and a page that exceeds the limit is also written to a temp file whose path is included in the result, so nothing is silently lost.

## It sits next to pi-web-access

This is the design decision that matters most if you already have a web tool installed. pi-web-access registers `web_search` and `fetch_content`; pi-web-search registers `web_search`. This package registers neither. It adds `deepseek_search` and `deepseek_fetch`, so all three can be loaded at once and the model chooses:

- `web_search` for the fast, provider-native path you already trust;
- `deepseek_search` when you want the ranking scores, the long summaries, or the price;
- `fetch_content` for local extraction, `deepseek_fetch` when a page only yields text through a server-side fetcher.

Nothing is renamed, nothing is shadowed, and removing the package leaves the other tools untouched.

## A paid API should say so

Every tool that spends money should make that visible. The footer in a pi session carries the DeepSeek mark and the state:

```
🐳 on · ¥0.005
```

That is one call, five-tenths of a fen. On a terminal 100 columns or wider the name comes along: `🐳 DeepSeek Tools on · ¥0.005`. With no key resolved it says `🐳 no key · /login deepseek` instead.

`/deepseek-tools` toggles the tools on and off, and `ctrl+shift+d` does the same. Off means off: both tools leave the active tool set, the model cannot call them, and nothing is billed. `/deepseek-tools status` prints where the key came from, the default result count, and the session total; `/deepseek-tools test` runs one search and reports latency and cost.

The tools are on by default, because a package you have to switch on before it works is a package that looks broken. To start every session with them off, add this to `~/.pi/agent/settings.json`:

```json
{ "deepseek-tools": { "enabledByDefault": false } }
```

## The price comparison, with the caveats

| API | List price per 1,000 requests |
| --- | --- |
| DeepSeek Search / Fetch | ¥5, about $0.70 |
| Brave Search (Data for AI) | $5 |
| Tavily (basic search) | $5 to $8 |
| Exa (search) | $7 |

Two things the table does not say. Billing is per successful request: a failed call, a timeout, or a search with no results costs nothing. And the two endpoints are metered separately, so a search-heavy agent does not spend its fetch budget.

Rate limits are 5 requests per second per account on each endpoint. The package retries 408, 429, and 5xx up to three attempts, honoring `Retry-After`, which is usually enough to absorb a burst of parallel tool calls. A rate limit that survives the retries surfaces as an error with the API's own message instead of a silent empty result.

## Where DeepSeek's fetcher stops

No search API is universally good, and pretending otherwise wastes your time.

- Some sites are refused outright. Wikipedia is one: `deepseek_fetch` answers HTTP 404 with an explanation instead of content.
- When a site serves its own error page, DeepSeek can extract that page, so a successful fetch does not prove the URL existed.
- Summaries vary in length. The API documents 600 to 800 characters; in practice results run from a hundred characters to a couple of thousand, so a search's context cost is not constant.
- A `summary` is sometimes the opening of the page itself rather than a rewrite. Read it as text, not as a guarantee.

For a coding agent, none of these are disqualifying. Search snippets usually carry enough to answer, `deepseek_fetch` covers the pages that matter, and the two tools are replaceable one call at a time.

## Structured output, if you script it

Both tools declare an output schema. Inside pi's `codemode`, a script receives `structuredContent` instead of text:

```js
const { results } = await tools.deepseek_search({ query: "deepseek v4", count: 3 });
return results.map((hit) => `${hit.title} — ${hit.url} (${hit.score?.toFixed(1)})`).join("\n");
```

That makes the cheap path also the scriptable one: filter by score, dedupe by host, or fetch the top three in parallel without parsing prose.

## Try it

```
pi install npm:@fastagent-sh/pi-deepseek-tools
```

The source, the demo, and the issue tracker live at [github.com/fastagent-sh/pi-deepseek-tools](https://github.com/fastagent-sh/pi-deepseek-tools). It is MIT. If the price difference is the reason you tried it, a star is the reason someone else finds it.

Disclosure: the package is published by fastagent, the same team that writes this blog. The API prices and limits above come from DeepSeek's own documentation and each provider's public price list, read in October 2026.
