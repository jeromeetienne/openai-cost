# openai-cost

Utilities to estimate OpenAI API call costs from `response.usage`, plus a fetch wrapper to track each OpenAI call.

This folder currently provides:
- `OpenAiCostCalculator`: computes USD cost for one call.
- `OpenAICallTracker`: wraps `fetch` so you can process each API response in a callback.

## What It Solves

- Convert OpenAI usage tokens into per-call USD cost.
- Handle cached input tokens (when pricing supports cache discounts).
- Support pricing tiers via `priorityType`: `batch`, `flex`, `standard`, `priority`.
- Track costs per bucket/team/project with a callback-based fetch wrapper.

## Install

From this folder:

```bash
npm install
```

Project dependency currently used here:
- `@jeromeetienne/openai-cache`

Examples also use:
- `openai`
- `cacheable`
- `@keyv/sqlite`
- `chalk` (comparator example)

## Quick Start: Cost Per Response

```ts
import OpenAI from "openai";
import { OpenAiCostCalculator } from "../src/openai_cost_calculator";

const openaiClient = new OpenAI();

const modelName = "gpt-4.1-nano";
const response = await openaiClient.responses.create({
	model: modelName,
	input: "say hello",
});

const usage = response.usage!;
const cost = await OpenAiCostCalculator.calculateLlmCost(modelName, usage);

console.log(cost);
// {
//   inputCost: number,
//   cacheInputCost: number,
//   outputCost: number,
//   totalCost: number
// }
```

## API

### `OpenAiCostCalculator.calculateLlmCost(modelName, usage, priorityType?)`

Signature:

```ts
calculateLlmCost(
	modelName: string,
	openaiUsage: OpenAI.Responses.ResponseUsage,
	priorityType: "batch" | "flex" | "standard" | "priority" = "standard"
): Promise<OpenAiCostResponse>
```

Returns:
- `inputCost`: input token cost in USD
- `cacheInputCost`: cached input token cost in USD
- `outputCost`: output token cost in USD
- `totalCost`: total USD cost

Behavior notes:
- Normalizes date-suffixed models such as `gpt-4o-2024-05-13` to `gpt-4o`.
- Handles special pricing split for:
  - `gpt-5.4` (`<272K` vs `>272K` context length)
  - `gpt-5.4-pro` (`<272K` vs `>272K` context length)
- Throws if no pricing is found for the model.

### `OpenAICallTracker.getFetchFn(trackerCallback, options?)`

Signature:

```ts
getFetchFn(
	trackerCallback: (bucketId: string, response: Response) => Promise<void>,
	options?: {
		bucketId?: string;
		originalFetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
	}
): Promise<(input: RequestInfo, init?: RequestInit) => Promise<Response>>
```

Behavior:
- Calls the provided `originalFetch` (default: global `fetch`).
- Clones the response and passes it to `trackerCallback(bucketId, response.clone())`.
- Returns the original response untouched.

## Running The Included Examples

From `contribs/openai-cost`:

```bash
npm run sample:basic
npm run sample:comparator
npm run sample:tracker
```

What they show:
- `examples/openai_cost_example.ts`: one call, print usage and cost.
- `examples/openai_cost_comparator.ts`: compare cost per call across multiple models.
- `examples/openai_cost_tracker_example.ts`: combine cache + tracker callback + persisted sample DB.

## Tracker + Cache Pattern

`openai_cost_tracker_example.ts` demonstrates:
- wrapping `@jeromeetienne/openai-cache` fetch with `OpenAICallTracker`,
- grouping tracked costs by `bucketId`,
- splitting spending into `spent` (live calls) and `saved` (cache hits),
- persisting tracked totals to JSON.

## Pricing Table

Pricing is hardcoded in:
- `src/openai_cost_calculator.ts` (`pricingPerModel`)

Update that object when OpenAI pricing changes.

## Caveats

- Cost results are estimates based on the local pricing table.
- Unknown/new model names will throw until added to `pricingPerModel`.
- The calculator currently mutates model pricing values when `priorityType` is not `standard`; if you call it repeatedly with mixed priorities in one process, results can drift. If you need strict correctness, clone pricing values before applying priority multipliers.

## License

MIT
