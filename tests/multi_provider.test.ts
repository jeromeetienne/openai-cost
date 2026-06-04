// node imports
import { describe, it, after } from "node:test";
import Assert from "node:assert";

// npm imports
import OpenAI from "openai";

// local imports
import { OpenAiCostCalculator } from "../src/openai_cost_calculator";
import { ProviderDetector } from "../src/provider-detector";
import { PricingRegistry } from "../src/pricing/pricing-registry";
import { LOCAL_FLAT_PRICE_PER_1M_TOKENS } from "../src/pricing/pricing-local";
import { OpenAiCostTrackerSqlite } from "../src/trackers/tracker_sqlite/tracker_sqlite";
import { createTempSqlitePath, cleanupFiles } from "./helpers/test_helper";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Helper: synthetic ResponseUsage
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function createResponseUsage(overrides: Partial<OpenAI.Responses.ResponseUsage> & {
	cached_tokens?: number
} = {}): OpenAI.Responses.ResponseUsage {
	return {
		input_tokens: overrides.input_tokens ?? 100,
		output_tokens: overrides.output_tokens ?? 50,
		total_tokens: (overrides.input_tokens ?? 100) + (overrides.output_tokens ?? 50),
		input_tokens_details: {
			cached_tokens: overrides.cached_tokens ?? 0,
		},
		output_tokens_details: {
			reasoning_tokens: 0,
		},
	} as OpenAI.Responses.ResponseUsage;
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ProviderDetector
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('ProviderDetector.fromUrl', () => {
	it('detects openai from api.openai.com', () => {
		Assert.strictEqual(ProviderDetector.fromUrl('https://api.openai.com/v1/chat/completions'), 'openai');
	});

	it('detects gemini from generativelanguage.googleapis.com', () => {
		Assert.strictEqual(ProviderDetector.fromUrl('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'), 'gemini');
	});

	it('detects ollama from localhost:11434', () => {
		Assert.strictEqual(ProviderDetector.fromUrl('http://localhost:11434/v1/chat/completions'), 'ollama');
	});

	it('detects lmstudio from localhost:1234', () => {
		Assert.strictEqual(ProviderDetector.fromUrl('http://localhost:1234/v1/chat/completions'), 'lmstudio');
	});

	it('defaults unknown hosts to openai', () => {
		Assert.strictEqual(ProviderDetector.fromUrl('https://my-proxy.example.com/v1/chat/completions'), 'openai');
	});

	it('defaults malformed URL to openai', () => {
		Assert.strictEqual(ProviderDetector.fromUrl('not-a-url'), 'openai');
	});
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PricingRegistry
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('PricingRegistry', () => {
	it('returns openai pricing for known openai model', () => {
		const pricing = PricingRegistry.getLlmPricing('openai', 'gpt-4.1-nano');
		Assert.strictEqual(pricing.inputPer1MTokens, 0.1);
	});

	it('returns gemini pricing for known gemini model', () => {
		const pricing = PricingRegistry.getLlmPricing('gemini', 'gemini-2.5-flash');
		Assert.strictEqual(pricing.inputPer1MTokens, 0.3);
	});

	it('returns flat local pricing for ollama with arbitrary model name', () => {
		const pricing = PricingRegistry.getLlmPricing('ollama', 'llama3.2:3b-some-tag');
		Assert.strictEqual(pricing.inputPer1MTokens, LOCAL_FLAT_PRICE_PER_1M_TOKENS);
		Assert.strictEqual(pricing.outputPer1MTokens, LOCAL_FLAT_PRICE_PER_1M_TOKENS);
		Assert.strictEqual(pricing.modelName, 'llama3.2:3b-some-tag');
	});

	it('returns flat local pricing for lmstudio with arbitrary model name', () => {
		const pricing = PricingRegistry.getLlmPricing('lmstudio', 'some/unknown-model');
		Assert.strictEqual(pricing.inputPer1MTokens, LOCAL_FLAT_PRICE_PER_1M_TOKENS);
	});

	it('throws for unknown gemini model', () => {
		Assert.throws(
			() => PricingRegistry.getLlmPricing('gemini', 'not-a-real-gemini-model'),
			{ message: /No pricing information found for model not-a-real-gemini-model \(provider=gemini\)/ }
		);
	});
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenAiCostCalculator with provider param
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('OpenAiCostCalculator.calculateLlmCost — multi-provider', () => {
	it('calculates gemini cost', async () => {
		// gemini-2.5-flash: input=0.3, output=2.5 per 1M tokens
		const usage = createResponseUsage({ input_tokens: 1_000_000, output_tokens: 1_000_000 });
		const cost = await OpenAiCostCalculator.calculateLlmCost('gemini-2.5-flash', usage, 'standard', 'gemini');

		Assert.strictEqual(cost.inputCost, 0.3);
		Assert.strictEqual(cost.outputCost, 2.5);
		Assert.strictEqual(cost.totalCost, 2.8);
	});

	it('selects gemini-2.5-pro >200K tier when over threshold', async () => {
		// >200K: input=2.5 per 1M
		const usage = createResponseUsage({ input_tokens: 250_000, output_tokens: 100 });
		const cost = await OpenAiCostCalculator.calculateLlmCost('gemini-2.5-pro', usage, 'standard', 'gemini');

		const expectedInputCost = (250_000 / 1_000_000) * 2.5;
		Assert.ok(Math.abs(cost.inputCost - expectedInputCost) < 1e-10, `Expected inputCost ~${expectedInputCost}, got ${cost.inputCost}`);
	});

	it('selects gemini-2.5-pro <200K tier when under threshold', async () => {
		// <200K: input=1.25 per 1M
		const usage = createResponseUsage({ input_tokens: 1000, output_tokens: 100 });
		const cost = await OpenAiCostCalculator.calculateLlmCost('gemini-2.5-pro', usage, 'standard', 'gemini');

		const expectedInputCost = (1000 / 1_000_000) * 1.25;
		Assert.ok(Math.abs(cost.inputCost - expectedInputCost) < 1e-10, `Expected inputCost ~${expectedInputCost}, got ${cost.inputCost}`);
	});

	it('calculates ollama cost for arbitrary model with flat $0.10/1M rate', async () => {
		const usage = createResponseUsage({ input_tokens: 1_000_000, output_tokens: 1_000_000 });
		const cost = await OpenAiCostCalculator.calculateLlmCost('llama3.2:1b', usage, 'standard', 'ollama');

		// 1M input + 1M output at $0.10/1M each
		Assert.ok(cost.totalCost > 0, `Expected totalCost > 0, got ${cost.totalCost} (must be summable, never zero)`);
		Assert.strictEqual(cost.inputCost, 0.1);
		Assert.strictEqual(cost.outputCost, 0.1);
		Assert.strictEqual(cost.totalCost, 0.2);
	});

	it('lmstudio uses the same flat rate', async () => {
		const usage = createResponseUsage({ input_tokens: 1_000_000, output_tokens: 0 });
		const cost = await OpenAiCostCalculator.calculateLlmCost('qwen2.5-7b-instruct', usage, 'standard', 'lmstudio');
		Assert.strictEqual(cost.inputCost, 0.1);
	});

	it('does not mutate shared pricing across priority calls (regression test)', async () => {
		const usage = createResponseUsage({ input_tokens: 1_000_000, output_tokens: 0 });

		// First call at batch (0.5x) then at standard (1x) should both reflect the base rate, not drift.
		const batchCost = await OpenAiCostCalculator.calculateLlmCost('gpt-4.1', usage, 'batch');
		const standardCost = await OpenAiCostCalculator.calculateLlmCost('gpt-4.1', usage, 'standard');

		// gpt-4.1 input rate is $2 / 1M
		Assert.strictEqual(batchCost.inputCost, 1.0);
		Assert.strictEqual(standardCost.inputCost, 2.0);
	});
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SQLite schema + provider persistence
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('OpenAiCostTrackerSqlite — provider column', () => {
	let dbPath: string;
	let tracker: OpenAiCostTrackerSqlite;

	after(async () => {
		if (tracker) await tracker.close();
		if (dbPath) cleanupFiles(dbPath);
	});

	it('creates schema with provider column and stores rows tagged with the right provider', async () => {
		dbPath = createTempSqlitePath('multi-provider');
		tracker = new OpenAiCostTrackerSqlite(dbPath);
		await tracker.init();

		// Synthesize a successful gemini-tagged response by reaching into the tracker callback.
		// We do this through a fake fetch that returns a canned response.
		const callback = await tracker.getTrackerCallback();

		const geminiBody = JSON.stringify({
			model: 'gemini-2.5-flash',
			choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'hi' } }],
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
		});
		const geminiResponse = new Response(geminiBody, {
			headers: { 'Content-Type': 'application/json' },
		});

		await callback(
			'bucket-gemini',
			'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
			undefined,
			geminiResponse,
		);

		const ollamaBody = JSON.stringify({
			model: 'llama3.2:1b',
			choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'hi' } }],
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
		});
		const ollamaResponse = new Response(ollamaBody, {
			headers: { 'Content-Type': 'application/json' },
		});

		await callback(
			'bucket-ollama',
			'http://localhost:11434/v1/chat/completions',
			undefined,
			ollamaResponse,
		);

		const records = await tracker.getAllRecords();
		Assert.strictEqual(records.length, 2);

		const geminiRecord = records.find(r => r.bucketId === 'bucket-gemini');
		Assert.ok(geminiRecord, 'Expected a gemini record');
		Assert.strictEqual(geminiRecord!.provider, 'gemini');
		Assert.strictEqual(geminiRecord!.modelName, 'gemini-2.5-flash');
		Assert.ok(geminiRecord!.costSpent > 0);

		const ollamaRecord = records.find(r => r.bucketId === 'bucket-ollama');
		Assert.ok(ollamaRecord, 'Expected an ollama record');
		Assert.strictEqual(ollamaRecord!.provider, 'ollama');
		Assert.strictEqual(ollamaRecord!.modelName, 'llama3.2:1b');
		Assert.ok(ollamaRecord!.costSpent > 0, 'ollama cost must be > 0 (flat fake rate), never zero');
	});
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	chat.completions cached-token billing (converter does not double-subtract)
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('OpenAiCostTrackerSqlite — chat.completions cached tokens', () => {
	let dbPath: string;
	let tracker: OpenAiCostTrackerSqlite;

	after(async () => {
		if (tracker) await tracker.close();
		if (dbPath) cleanupFiles(dbPath);
	});

	it('bills cached prompt tokens once at the cache rate (prompt_tokens already includes cached)', async () => {
		dbPath = createTempSqlitePath('chat-cached');
		tracker = new OpenAiCostTrackerSqlite(dbPath);
		await tracker.init();

		const callback = await tracker.getTrackerCallback();

		// gpt-4o: input=2.5/1M, cacheInput=1.25/1M, output=10/1M.
		// prompt_tokens (1000) INCLUDES the cached subset (800) -> 200 uncached @2.5, 800 cached @1.25.
		const body = JSON.stringify({
			model: 'gpt-4o',
			choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'hi' } }],
			usage: {
				prompt_tokens: 1000,
				completion_tokens: 500,
				total_tokens: 1500,
				prompt_tokens_details: { cached_tokens: 800 },
			},
		});
		const response = new Response(body, { headers: { 'Content-Type': 'application/json' } });

		await callback('bucket-cached', 'https://api.openai.com/v1/chat/completions', undefined, response);

		const records = await tracker.getAllRecords();
		Assert.strictEqual(records.length, 1);

		// inputCost 200/1e6*2.5=0.0005 + cacheInputCost 800/1e6*1.25=0.001 + outputCost 500/1e6*10=0.005 = 0.0065
		const record = records[0];
		Assert.strictEqual(record.provider, 'openai');
		Assert.ok(Math.abs(record.costSpent - 0.0065) < 1e-12, `Expected costSpent 0.0065, got ${record.costSpent}`);
	});
});
