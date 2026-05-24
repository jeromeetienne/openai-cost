# I Got Tired of Guessing What My AI Calls Cost

The first time I shipped a feature that called `gpt-5.4`, I felt like I had installed a smart meter — except backwards. I could see the meter spin. I couldn't tell what was using the power.

A week later, the OpenAI dashboard showed a number. The number was bigger than I expected. I had no idea which feature, which user, which experiment, or which model ate the budget. The dashboard told me the room was warm. It didn't tell me the window was open.

So I built [`openai-cost`](https://github.com/jeromeetienne/openai-cost) — a small Node.js package that turns OpenAI usage into actual dollars, attributes those dollars to a label of your choosing, and writes them to SQLite so you can answer "what did this thing cost?" without waiting for the invoice.

This article is the **why**, the **what**, and the **how**.

## Why

Three things kept biting me. I suspect they bite you too.

**Tokens are a unit of count, not money.** OpenAI bills in tokens — input, output, cached input, reasoning — and the price-per-million differs per model, per tier (`batch` is half-price, `priority` is double), and per context length. `gpt-5.4` at 271,999 input tokens is one price; at 272,001 it's another. You're not going to do that math in your head, and you definitely don't want to do it in code spread across twelve files.

**The OpenAI dashboard aggregates by org, not by your stuff.** You don't ship "OpenAI calls". You ship a chat feature, an embeddings pipeline, an experiment for a specific cohort, an internal tool. Free-tier users vs paid ones. The dashboard gives you one big number for all of it. Good luck splitting that back into anything actionable.

**Caching changes the math, and nothing tells you that by default.** If you front your OpenAI client with a cache, a cache hit costs nothing — but your code still made an API call, the usage block is still there, and "cost" is now ambiguous. Was it *spent* or *saved*? Both are interesting numbers. Neither is automatic.

## What

`openai-cost` is two primitives, one storage layer, and one viewer.

- [`OpenAiCostCalculator`](https://github.com/jeromeetienne/openai-cost/blob/HEAD/src/openai_cost_calculator.ts) — usage in, USD out. Handles the `>272K`-vs-`<272K` price split for `gpt-5.4` and `gpt-5.4-pro`, normalizes date-suffixed model names (`gpt-4o-2024-05-13` → `gpt-4o`), and applies the right multiplier for the `batch` / `flex` / `standard` / `priority` tiers. A separate `calculateEmbeddingCost` covers the embedding endpoints.
- [`OpenAICallTracker.getFetchFn`](https://github.com/jeromeetienne/openai-cost/blob/HEAD/src/openai_cost_tracker.ts) — a `fetch` wrapper you pass straight into `new OpenAI({ fetch: ... })`. It fires your callback once per API call, with a `bucketId` of your choosing. A bucket is whatever you want it to be: a feature, a team, an experiment, a user tier.
- [`OpenAiCostTrackerSqlite`](https://github.com/jeromeetienne/openai-cost/blob/HEAD/src/trackers/tracker_sqlite/tracker_sqlite.ts) — a drop-in callback that writes every call into a SQLite table with columns `dateIso, bucketId, modelName, costSpent, costSaved`. The `spent`-vs-`saved` split is automatic when you pair it with [`openai-cache`](https://www.npmjs.com/package/openai-cache): live calls land in `costSpent`, cache hits land in `costSaved`.
- [`openai_cost:watch`](https://github.com/jeromeetienne/openai-cost/blob/HEAD/src/trackers/tracker_sqlite/bin/tracker_sqlite_pp.ts) — `tail -f` for your AI bill. Point it at the SQLite file and watch the costs land in real time, grouped by bucket and model.

You can use any one of these on its own, or stack them. The most fun is stacking them.

## How

### 1. Calculator only

You have a `response` from the OpenAI SDK. You want a dollar number. Done.

```ts
import OpenAI from 'openai';
import { OpenAiCostCalculator } from 'openai-cost';

const openai = new OpenAI();
const response = await openai.responses.create({
    model: 'gpt-5-mini',
    input: 'say hello',
});

const cost = await OpenAiCostCalculator.calculateLlmCost(response.model, response.usage!);
console.log(cost.totalCost); // 0.0000165
```

The calculator is pure: usage in, `{ inputCost, cacheInputCost, outputCost, totalCost }` out. Use it ad-hoc, in tests, or to compare models — there's a [model-comparator example](https://github.com/jeromeetienne/openai-cost/blob/HEAD/examples/openai_cost_comparator.ts) in the repo that prints a USD-per-call table across `gpt-5.4`, `gpt-5.4-mini`, `gpt-4o`, and friends in about 40 lines.

### 2. Fetch wrapper with a bucket

For continuous tracking you don't want to remember to call the calculator at every site. You want to wire it once. The `fetch` slot on the OpenAI client is the perfect seam.

```ts
import OpenAI from 'openai';
import { OpenAICallTracker } from 'openai-cost';

const trackedFetch = await OpenAICallTracker.getFetchFn(
    async (bucketId, _input, _init, response) => {
        // do whatever you want with response.clone(): log, sum, post to Slack
    },
    { bucketId: 'feature-onboarding-v2' },
);

const openai = new OpenAI({ fetch: trackedFetch });
```

`bucketId` is just a string. You decide what it means. One tracker per bucket, or one tracker that switches buckets per request — whatever fits.

A small but load-bearing detail: when you stream `/chat/completions`, OpenAI doesn't emit usage by default. The wrapper auto-injects `stream_options.include_usage = true` for you, so cost tracking works on streamed completions without you having to remember.

### 3. The full stack: cache + tracker + SQLite + watcher

The combination I actually use. Cache requests with [`openai-cache`](https://www.npmjs.com/package/openai-cache), wrap that cached `fetch` with `OpenAICallTracker`, and pipe the callback into `OpenAiCostTrackerSqlite`.

```ts
import OpenAI from 'openai';
import OpenAICache from 'openai-cache';
import { Cacheable } from 'cacheable';
import KeyvSqlite from '@keyv/sqlite';
import { OpenAICallTracker, OpenAiCostTrackerSqlite } from 'openai-cost';

const cache = new OpenAICache(
    new Cacheable({ secondary: new KeyvSqlite('sqlite://./cache.sqlite') }),
    { markResponseEnabled: true }, // adds the header the tracker reads
);

const tracker = new OpenAiCostTrackerSqlite('./tracker.sqlite');
await tracker.init();
tracker.on(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, (entry) => {
    // entry: { dateIso, bucketId, modelName, costSpent, costSaved }
});

const openai = new OpenAI({
    fetch: await OpenAICallTracker.getFetchFn(await tracker.getTrackerCallback(), {
        bucketId: 'feature-onboarding-v2',
        originalFetch: cache.getFetchFn(),
    }),
});
```

Every call now flows: SDK → tracker fetch → cache fetch → OpenAI. Live calls land in `costSpent`. Cache hits land in `costSaved`. The `BUCKET_WRITTEN` event fires on every insert, which is the seam you want for Slack alerts, Grafana writes, kill-switches at a budget threshold — whatever you'd build.

Then, in a second terminal:

```bash
npm run openai_cost:watch
```

It pretty-prints the running totals from the SQLite file, grouped by bucket and model. It's the receipt printer for your AI usage.

The full end-to-end version, including assertions that the spent/saved split actually works, lives in [examples/openai_cost_tracker_sqlite_example.ts](https://github.com/jeromeetienne/openai-cost/blob/HEAD/examples/openai_cost_tracker_sqlite_example.ts).

## Caveats and close

Two honest disclaimers. The pricing table in [src/openai_cost_calculator.ts](https://github.com/jeromeetienne/openai-cost/blob/HEAD/src/openai_cost_calculator.ts) is hardcoded — when OpenAI changes prices, somebody (often me, sometimes you, hopefully via a PR) needs to update it. A new model name will throw until it's added. And all numbers are estimates, as accurate as that table.

That said: an estimate you can see, attribute, and react to is worth ten dashboards you only check after the bill arrives. You can't optimize what you don't measure. `openai-cost` is the meter that should have come in the box.

Source, issues, and PRs welcome: [github.com/jeromeetienne/openai-cost](https://github.com/jeromeetienne/openai-cost). MIT.
