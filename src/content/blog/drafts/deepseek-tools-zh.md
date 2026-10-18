# 给 agent 接上 DeepSeek 的搜索与抓取：¥5/千次，国内直连

> 这篇是中文分发稿，不进入英文站点的 blog collection（放在 `drafts/` 子目录，glob 只收平铺的 `*.md`）。
> 发布到掘金 / 知乎 / V2EX / 公众号时按各平台调语气，文末备注不要一起发。

一个每天搜 100 次的 agent 不便宜。检索 API 普遍按次计费：Brave 是 $5/千次，Tavily $5~8，Exa $7。一天 100 次、一个月就是 $15~25，这还没算抓取页面。

DeepSeek 把同样的活定价在 **¥5 / 1,000 次成功请求**，约合 $0.70。它不是转售别人的结果：自建索引、返回排序分数、附上给模型读的长摘要。接口就两个，普通 JSON：

```
POST https://api.deepseek.com/v1/tools/search
POST https://api.deepseek.com/v1/tools/fetch
```

`api.deepseek.com` 在国内直连，不用代理 —— 这是它相对海外检索 API 最实际的一条。

## 两个接口，都不走模型

`/v1/tools/search` 接收 query、count（1~50）和是否返回正文；返回一个结果数组，每条带标题、URL、短摘要、长摘要、站点名、发布时间，以及两个分数：`rerank_score`（0~3）和 `authority`（0~4）。官方说明里 1.5 分以上算优质，authority 3 以上是极权威。

`/v1/tools/fetch` 接收一个 URL，返回标题加 Markdown 正文。抽取在 DeepSeek 服务端完成，本机不跑无头浏览器、不做 readability、不经过代理。

两个接口都不调用大模型，所以计费与 token 无关，也不会出现"模型帮我搜索"那种一次调用触发多次检索的账单。

## 返回的东西是给模型读的

普通检索 API 返回的是给人扫一眼的片段。这里的字段是给 agent 做判断用的：

- `summary` 典型长度 600~800 字符，是按"整段读"设计的，不是等人截断的碎片；
- `rerank_score` 把相关性、权威性、时效性揉成一个数，agent 可以在花一次 fetch 之前先扔掉弱结果；
- `authority` 是第二个更慢变化的信号，用来做同一类判断；
- `date` 在页面声明时给出 RFC 3339 UTC 时间，"只要 2025 年以后"这种过滤可以在拿到结果后再做。

差别在于：一边是一串链接，另一边是 agent 不抓页面也能判断的结果。

## 在 pi 里安装

```
pi install npm:@fastagent-sh/pi-deepseek-tools
```

包里注册两个工具 `deepseek_search`、`deepseek_fetch`，一个命令 `/deepseek-tools`。

Key 的来源按优先级：

1. `DEEPSEEK_API_KEY`；
2. pi 里已有的 `deepseek` 凭据（`/login deepseek` 或 `pi auth`）；
3. pi agent 目录下 `web-search.json` 里的 `deepseekApiKey`（pi-web-access 用的同一个字段）。

如果你本来就用 DeepSeek 当模型 provider，这里不用配任何东西。

## 搜索

```
deepseek_search {"query": "深度求索 搜索 API", "count": 5}
```

默认 5 条，因为 10 条大约要多花 6.6k token 上下文。做调研时再调大 `count`，查单个事实时调小。`includeContent: true` 会给每条都带正文，只在确实需要时开；单页正文用 `deepseek_fetch` 更省也更准。

查询算子原样透传：`site:`、`-site:`、`-"精确短语"`、`-词`、`lang:zh,en`、`after:2025-01-01`、`before:2026-06-01`。一个实际点的组合：

```
deepseek_search {"query": "deepseek site:github.com OR site:huggingface.co lang:zh after:2025", "count": 10}
```

query 上限 128 个字符（含算子）。超了包在本地直接拒绝，不会让你等一个 400 回来。

## 抓取

```
deepseek_fetch {"url": "https://api-docs.deepseek.com/zh-cn/guides/search/"}
```

返回标题加 Markdown。输出截断在 50 KB 或 2000 行（先到者为准），超限的页面会同时写到临时文件，路径放在结果里，不会悄悄丢内容。

## 它和 pi-web-access 不打架

这条对已经装了 web 工具的人最重要。pi-web-access 注册的是 `web_search` 和 `fetch_content`，pi-web-search 注册的是 `web_search`，这个包两个都不占，只加 `deepseek_search` 和 `deepseek_fetch`。三者可以同时装，由模型选：

- 走 `web_search`：你已经在用的原生检索；
- 走 `deepseek_search`：想要排序分数、长摘要，或者想省钱；
- 走 `fetch_content`：本地抽取；`deepseek_fetch` 用在只有服务端抓取才出正文的页面。

没有改名，没有覆盖，卸载之后其它工具完全不受影响。

## 收费接口应该自己说出来

花钱的工具就该让人随时看得见。pi 的 footer 里有 DeepSeek 标记和状态：

```
🐳 on · ¥0.005
```

一次调用，半分钱。终端宽度 100 列以上会带上名字：`🐳 DeepSeek Tools on · ¥0.005`；没有可用 key 时显示 `🐳 no key · /login deepseek`。

`/deepseek-tools` 开关，`ctrl+shift+d` 同效。"关"是真的关：两个工具从 active 工具集里移除，模型调不到，也不会产生费用。`/deepseek-tools status` 显示 key 来源、默认条数、本次会话花费；`/deepseek-tools test` 真跑一次搜索并报告耗时与费用。

默认开启 —— 装完还要手动打开，用户只会以为坏了。想每次会话默认关闭，在 `~/.pi/agent/settings.json` 里加：

```json
{ "deepseek-tools": { "enabledByDefault": false } }
```

## 价格对比与口径

| API | 标价（每 1000 次） |
| --- | --- |
| DeepSeek 搜索 / 抓取 | ¥5（约 $0.70） |
| Brave 搜索（Data for AI） | $5 |
| Tavily（基础搜索） | $5~8 |
| Exa（搜索） | $7 |

表里没写的两条更重要。**只对成功请求计费**：失败、超时、搜索无结果都不收费。两个接口**分别计费**，搜索多的 agent 不会挤占抓取额度。

限速是每个账号每个接口 5 QPS。这个包对 408、429、5xx 最多重试三次并遵守 `Retry-After`，一般够吸收并行工具调用的瞬时高峰；重试后仍被限流会带着 API 原文报错，而不是返回一个静默的空结果。

## DeepSeek 抓不到的地方

没有哪个检索 API 是万能的，装作不是只会浪费时间：

- 有些站点直接拒绝抓取。Wikipedia 就是其中之一：`deepseek_fetch` 会返回 404 并说明原因，而不是正文。
- 站点自己的错误页可能被当成正文抽出来，所以"抓取成功"不等于 URL 存在。
- 摘要长度不稳定。文档写 600~800 字符，实测从一百多到两千都有，所以一次搜索的上下文成本不是常数。
- `summary` 有时是页面开头本身，而不是改写。当文本读，别当承诺。

对编码 agent 来说这些都不致命：大部分问题靠摘要就能回答，真要读页面有 `deepseek_fetch`，两个工具都可以一次一调地替换掉。

## 需要脚本时：结构化输出

两个工具都声明了 output schema。在 pi 的 `codemode` 里，脚本拿到的是 `structuredContent`，不是文本：

```js
const { results } = await tools.deepseek_search({ query: "deepseek v4", count: 3 });
return results.map((hit) => `${hit.title} — ${hit.url} (${hit.score?.toFixed(1)})`).join("\n");
```

可以按分数过滤、按域名去重、并行抓前三页，都不用解析散文。

## 试一下

```
pi install npm:@fastagent-sh/pi-deepseek-tools
```

源码、演示和 issue 在 [github.com/fastagent-sh/pi-deepseek-tools](https://github.com/fastagent-sh/pi-deepseek-tools)，MIT。如果它是冲着价差来的，star 是它被别人看见的方式。

---

## 发帖备注（发布时删除）

- **掘金**：标题偏"账算给你看"，《Agent 搜索一年要花多少钱？我把它从 $25/月压到 ¥0.7/千次》更有钩子；保留价格表和局限段落。
- **知乎**：问题式切入（"给 coding agent 做网页搜索，哪家 API 最便宜？"），先给结论表，再讲字段设计和坑。
- **V2EX**：发在分享节点，标题朴素（`分享一个给 pi 用的 DeepSeek 搜索/抓取插件`），正文压到 300 字内，细节链到博客。
- **公众号**：开头换成一次真实账单（100 次/天 × 30 天），删掉算子表格，留价格表和"国内直连"。
- **即刻**：一句话 + GIF + 安装命令，不贴长文。
- 所有平台都别刷同一天多群转发；Discord/Reddit 用英文版，语气是"分享一个实现"而不是"求 star"。
