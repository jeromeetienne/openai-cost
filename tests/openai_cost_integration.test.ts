// node imports
import { describe, it, before, after } from "node:test";
import Assert from "node:assert";
import Path from "node:path";

// npm imports
import OpenAI from "openai";
import OpenAICache from "openai-cache";
import KeyvSqlite from "@keyv/sqlite";
import { Cacheable } from "cacheable";

// local imports
import { OpenAiCostCalculator } from "../src/openai_cost_calculator";
import { createTempSqlitePath, cleanupFiles } from "./helpers/test_helper";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Setup
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let openaiClient: OpenAI;
let openaiCache: OpenAICache;
let cacheSqlitePath: string;

const hasApiKey = !!process.env.OPENAI_API_KEY;

before(() => {
	if (!hasApiKey) return;

	cacheSqlitePath = createTempSqlitePath("integration-cache");
	const sqlitePath = `sqlite://${cacheSqlitePath}`;
	const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(sqlitePath) });
	openaiCache = new OpenAICache(sqliteCache);
	openaiClient = new OpenAI({
		fetch: openaiCache.getFetchFn(),
		timeout: 60_000,
	});
});

after(() => {
	if (cacheSqlitePath) cleanupFiles(cacheSqlitePath);
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Tests: non-streamed call
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe("Integration: non-streamed call", { skip: !hasApiKey ? "OPENAI_API_KEY not set" : false }, () => {

	it("returns valid usage and non-zero cost", async () => {
		await openaiCache.cleanCache();

		const response = await openaiClient.responses.create({
			model: "gpt-4.1-nano",
			input: "hello",
		});

		const usage = response.usage!;
		Assert.ok(usage, "Expected usage to be defined");
		Assert.ok(usage.input_tokens > 0, "Expected input_tokens > 0");
		Assert.ok(usage.output_tokens > 0, "Expected output_tokens > 0");

		const cost = await OpenAiCostCalculator.calculateCost("gpt-4.1-nano", usage);
		Assert.ok(cost.totalCost > 0, `Expected totalCost > 0, got ${cost.totalCost}`);
		Assert.ok(cost.inputCost >= 0);
		Assert.ok(cost.outputCost >= 0);
		Assert.ok(cost.cacheInputCost >= 0);
	});
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Tests: streamed call
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe("Integration: streamed call", { skip: !hasApiKey ? "OPENAI_API_KEY not set" : false }, () => {

	it("returns valid usage and non-zero cost", async () => {
		await openaiCache.cleanCache();

		const stream = await openaiClient.responses.create({
			model: "gpt-4.1-nano",
			input: "hello",
			stream: true,
		});

		// consume stream to get the final event
		let lastEvent: OpenAI.Responses.ResponseStreamEvent | undefined;
		for await (const event of stream) {
			lastEvent = event;
		}

		Assert.ok(lastEvent, "Expected at least one stream event");
		Assert.strictEqual(lastEvent!.type, "response.completed");

		const completedEvent = lastEvent as OpenAI.Responses.ResponseCompletedEvent;
		const usage = completedEvent.response.usage!;
		Assert.ok(usage, "Expected usage to be defined");
		Assert.ok(usage.input_tokens > 0, "Expected input_tokens > 0");
		Assert.ok(usage.output_tokens > 0, "Expected output_tokens > 0");

		const cost = await OpenAiCostCalculator.calculateCost("gpt-4.1-nano", usage);
		Assert.ok(cost.totalCost > 0, `Expected totalCost > 0, got ${cost.totalCost}`);
	});
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Tests: embedding call
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe("Integration: embedding call", { skip: !hasApiKey ? "OPENAI_API_KEY not set" : false }, () => {

	it("returns valid usage and non-zero cost with outputCost === 0", async () => {
		await openaiCache.cleanCache();

		const response = await openaiClient.embeddings.create({
			model: "text-embedding-3-small",
			input: "hello world",
		});

		const usage = response.usage;
		Assert.ok(usage, "Expected usage to be defined");
		Assert.ok(usage.prompt_tokens > 0, "Expected prompt_tokens > 0");

		const cost = await OpenAiCostCalculator.calculateEmbeddingCost("text-embedding-3-small", usage);
		Assert.ok(cost.totalCost > 0, `Expected totalCost > 0, got ${cost.totalCost}`);
		Assert.strictEqual(cost.outputCost, 0);
		Assert.strictEqual(cost.cacheInputCost, 0);
	});
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Tests: cache speedup
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe("Integration: cache speedup", { skip: !hasApiKey ? "OPENAI_API_KEY not set" : false }, () => {

	it("second identical call is faster due to cache", async () => {
		await openaiCache.cleanCache();

		// first call (not cached)
		const start1 = Date.now();
		await openaiClient.responses.create({
			model: "gpt-4.1-nano",
			input: "cache test hello",
		});
		const elapsed1 = Date.now() - start1;

		// second call (should be cached)
		const start2 = Date.now();
		await openaiClient.responses.create({
			model: "gpt-4.1-nano",
			input: "cache test hello",
		});
		const elapsed2 = Date.now() - start2;

		const speedup = elapsed1 / elapsed2;
		Assert.ok(speedup > 2, `Expected speedup > 2x, got ${speedup.toFixed(2)}x (${elapsed1}ms vs ${elapsed2}ms)`);
	});
});
