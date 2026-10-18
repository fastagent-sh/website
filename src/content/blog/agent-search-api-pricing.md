---
title: "Search API pricing for AI agents, compared"
date: 2026-10-18
description: "Brave, Tavily, Exa and DeepSeek all quote a price per 1,000 searches. What one request includes, what the plans hide, and what a realistic agent task costs."
tags:
  - web-search
  - cost
  - agents
author: kid7st
authorUrl: https://github.com/kid7st
image: /og/agent-search-api-pricing.png
---

A price per 1,000 requests is where a search API comparison starts, not where it ends. One provider counts a basic query as one request and an advanced one as two. Another bills its result page separately from the page text. A third charges nothing for a query that returns nothing. An agent doing five searches and reading three pages pays a different bill under each of them.

This is the comparison we wanted when wiring search into [pi](https://pi.dev), using list prices read in October 2026. Every provider changes prices; check the link before you budget.

| Provider | List price per 1,000 requests | One request is | Rate limit | Free allowance |
| --- | --- | --- | --- | --- |
| Brave Search | $5 | A query, with optional LLM Context passages | 50 queries/second | $5 monthly credit, about 1,000 requests |
| Tavily | $8 basic, $16 advanced on pay-as-you-go; $5 to $7.50 on plans | A search at `basic` (1 credit) or `advanced` (2 credits) | Plan-dependent | 1,000 credits/month |
| Exa | From $4 for search; $1 per 1,000 pages for contents; $12 to $15 for deep search | A search, or a page of contents | Plan-dependent | $10 in credits per month |
| DeepSeek | ¥5, about $0.70, for search and ¥5 for fetch, billed separately | A successful search or a successful fetch | 5 requests/second per endpoint | None |

## Brave Search API pricing

$5 per 1,000 requests on the Search and Data-for-AI plans, with a $5 monthly credit that covers roughly the first 1,000. The same plan includes the LLM Context endpoint, which returns ranked passages rather than a result list, so an agent can skip a second fetch for a lot of questions. Brave answers from its own index, with no fallback to Google or Bing, and allows 50 queries per second.

Where it bites: the result page is the unit. If your agent then wants full page text, that is either LLM Context (already covered) or your own extraction, and the extraction cost comes out of your infrastructure budget instead.

## Tavily pricing

Tavily sells credits. Pay-as-you-go is $0.008 per credit, and the monthly plans run from $0.0075 down to $0.005 per credit as volume grows. A `basic` search costs one credit, an `advanced` search costs two, so a thousand basic searches are $8 on pay-as-you-go or $5 to $7.50 on a plan, and advanced doubles it. Extraction is priced separately at one credit per five successful URLs, and a failed extraction is not billed.

Where it bites: the depth flag is the price. An agent that defaults to `advanced` is paying double without a visible difference in the dashboard until the invoice arrives.

## Exa pricing

Exa prices search as a floor and everything else on top: search from $4 per 1,000, page contents at $1 per 1,000 pages, deep search at $12 to $15 per 1,000, and the Answer endpoint at $5 per 1,000. The Free Tier gives $10 in credits each month.

Where it bites: the $4 line covers search results; if the agent needs the text of ten pages for every query, that is a second line on the bill. Deep search is a genuinely different product and priced like one.

## DeepSeek pricing

DeepSeek runs its own index and charges ¥5 per 1,000 successful requests, about $0.70, for search and the same again for fetch. Search returns a rank score, an authority score, and a 600 to 800 character summary per result, so the common case does not need a fetch at all. Each endpoint allows 5 requests per second per account.

Where it bites: the rate limit is 5 QPS rather than 50, so a burst of parallel tool calls needs retries, and some sites are refused by the fetcher outright. Neither is billed, because only successful requests cost anything.

## What the price per 1,000 hides

Three things move a bill more than the headline rate:

1. **Request multipliers.** Tavily's `advanced` counts as two requests. Any provider offering a "deep" or "research" mode charges several times its base rate, and those modes are the ones that look impressive in a demo.
2. **Contents versus results.** A search result is cheap; the text behind ten of them is another product. Exa charges for contents, Tavily charges for extraction, Brave folds some of it into LLM Context, and DeepSeek counts each fetch as a request of its own.
3. **Failures.** DeepSeek bills only successful searches and fetches. Tavily does not bill failed extractions. Others bill the request whether or not it produced anything usable, which matters when scanning a long tail where a third of the queries come back empty.

## One task, four bills

Five searches and the text of three pages, the shape of a small research step:

| Provider | What it bills | Cost |
| --- | --- | --- |
| Brave | 8 requests, LLM Context included | $0.04 |
| Tavily | 5 basic searches + 1 extraction credit | $0.048 pay-as-you-go, about $0.045 on the Project plan |
| Exa | 5 searches + 3 pages of contents | about $0.02 |
| DeepSeek | 8 successful requests, ¥0.005 each | ¥0.04, about $0.006 |

At a hundred tasks a day, the spread is roughly $60 to $145 a month for Brave and Tavily, against under $2 for DeepSeek. Exa sits in between because its search floor is lower but its contents are metered separately.

## How to choose

- **Already standardized on a provider:** keep it. The integration cost of switching search providers is higher than the per-request difference for most teams.
- **Need an index that is not a Google or Bing pass-through:** Brave.
- **Need advanced or deep research modes:** Tavily `advanced` or Exa deep search, and budget at the advanced rate rather than the headline one.
- **Need page text at volume:** compare Exa contents, Tavily extract, and a provider whose fetch is its own endpoint.
- **Cheapest per successful request, with ranking scores and summaries included:** DeepSeek. It is also reachable from mainland China without a proxy, which rules out several of the others for teams there.

## The pi package

We wrapped the DeepSeek endpoints into two pi tools, `deepseek_search` and `deepseek_fetch`, and wrote up the details in [DeepSeek web search for pi](/blog/deepseek-web-tools-for-pi/). The short version: they register names that do not collide with pi-web-access, the footer shows what the session has spent, and `/deepseek-tools` switches them off when you do not want to pay for a call.

```
pi install npm:@fastagent-sh/pi-deepseek-tools
```

Disclosure: the package is published by fastagent, which publishes this blog. Prices above are list prices from each provider's public pricing page, read in October 2026; none of the providers reviewed the post.
