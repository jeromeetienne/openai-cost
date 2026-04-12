// node imports
import { describe, it, before, after } from "node:test";
import Assert from "node:assert";

// npm imports
import OpenAI from "openai";
import OpenAICache from "openai-cache";
import KeyvSqlite from "@keyv/sqlite";
import { Cacheable } from "cacheable";

// local imports
import { OpenAiCostCalculator } from "../src/openai_cost_calculator";
import { OpenAiCostTracker } from "../src/openai_cost_tracker";
import { OpenAiCostTrackerSqlite, OpenAiCostTrackerSqliteEntry } from "../src/trackers/tracker_sqlite/tracker_sqlite";
import { createTempSqlitePath, cleanupFiles, waitForEvent } from "./helpers/test_helper";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Setup
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let openaiClient: OpenAI;
let openaiCache: OpenAICache;
let trackerSqlite: OpenAiCostTrackerSqlite;
let cacheSqlitePath: string;
let trackerSqlitePath: string;

const BUCKET_ID = "test-tracker-bucket";
const hasApiKey = !!process.env.OPENAI_API_KEY;

before(async () => {
	if (!hasApiKey) return;

	// setup cache
	cacheSqlitePath = createTempSqlitePath("tracker-cache");
	const sqlitePath = `sqlite://${cacheSqlitePath}`;
	const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(sqlitePath) });
	openaiCache = new OpenAICache(sqliteCache, {
		markResponseEnabled: true,
	});

	// setup tracker sqlite
	trackerSqlitePath = createTempSqlitePath("tracker-db");
	trackerSqlite = new OpenAiCostTrackerSqlite(trackerSqlitePath);
	await trackerSqlite.init();

	// build fetch with tracking
	const fetchWithTracking = await OpenAiCostTracker.getFetchFn(
		await trackerSqlite.getTrackerCallback(),
		{
			bucketId: BUCKET_ID,
			originalFetch: openaiCache.getFetchFn(),
		}
	);

	// init OpenAI client
	openaiClient = new OpenAI({
		fetch: fetchWithTracking,
		timeout: 60_000,
	});
});

after(async () => {
	if (trackerSqlite) await trackerSqlite.close();
	if (cacheSqlitePath) cleanupFiles(cacheSqlitePath);
	if (trackerSqlitePath) cleanupFiles(trackerSqlitePath);
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Tests: non-streamed tracking
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe("Tracker: non-streamed tracking", { skip: !hasApiKey ? "OPENAI_API_KEY not set" : false }, () => {

	it("first call (not cached): costSpent > 0, costSaved === 0", async () => {
		await openaiCache.cleanCache();

		const eventPromise = waitForEvent<OpenAiCostTrackerSqliteEntry>(
			trackerSqlite, OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN
		);

		await openaiClient.responses.create({
			model: "gpt-4.1-nano",
			input: "tracker nostream test",
		});

		const payload = await eventPromise;
		Assert.ok(payload.costSpent > 0, `Expected costSpent > 0, got ${payload.costSpent}`);
		Assert.strictEqual(payload.costSaved, 0, `Expected costSaved === 0, got ${payload.costSaved}`);
		Assert.ok(payload.modelName, "Expected modelName to be defined");
		Assert.strictEqual(payload.bucketId, BUCKET_ID);
	});

	it("second call (cached): costSaved > 0, costSpent === 0", async () => {
		// do NOT clean cache — reuse from previous test

		const eventPromise = waitForEvent<OpenAiCostTrackerSqliteEntry>(
			trackerSqlite, OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN
		);

		await openaiClient.responses.create({
			model: "gpt-4.1-nano",
			input: "tracker nostream test",
		});

		const payload = await eventPromise;
		Assert.ok(payload.costSaved > 0, `Expected costSaved > 0, got ${payload.costSaved}`);
		Assert.strictEqual(payload.costSpent, 0, `Expected costSpent === 0, got ${payload.costSpent}`);
	});
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Tests: streamed tracking
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe("Tracker: streamed tracking", { skip: !hasApiKey ? "OPENAI_API_KEY not set" : false }, () => {

	it("first call (not cached): costSpent > 0, costSaved === 0", async () => {
		await openaiCache.cleanCache();

		const eventPromise = waitForEvent<OpenAiCostTrackerSqliteEntry>(
			trackerSqlite, OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN
		);

		const stream = await openaiClient.responses.create({
			model: "gpt-4.1-nano",
			input: "tracker streamed test",
			stream: true,
		});

		// consume stream
		for await (const _event of stream) { }

		const payload = await eventPromise;
		Assert.ok(payload.costSpent > 0, `Expected costSpent > 0, got ${payload.costSpent}`);
		Assert.strictEqual(payload.costSaved, 0, `Expected costSaved === 0, got ${payload.costSaved}`);
	});

	it("second call (cached): costSaved > 0, costSpent === 0", async () => {
		const eventPromise = waitForEvent<OpenAiCostTrackerSqliteEntry>(
			trackerSqlite, OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN
		);

		const stream = await openaiClient.responses.create({
			model: "gpt-4.1-nano",
			input: "tracker streamed test",
			stream: true,
		});

		// consume stream
		for await (const _event of stream) { }

		const payload = await eventPromise;
		Assert.ok(payload.costSaved > 0, `Expected costSaved > 0, got ${payload.costSaved}`);
		Assert.strictEqual(payload.costSpent, 0, `Expected costSpent === 0, got ${payload.costSpent}`);
	});
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Tests: embedding tracking
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe("Tracker: embedding tracking", { skip: !hasApiKey ? "OPENAI_API_KEY not set" : false }, () => {

	it("first call (not cached): costSpent > 0, costSaved === 0", async () => {
		await openaiCache.cleanCache();

		const eventPromise = waitForEvent<OpenAiCostTrackerSqliteEntry>(
			trackerSqlite, OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN
		);

		await openaiClient.embeddings.create({
			model: "text-embedding-3-small",
			input: "tracker embedding test",
		});

		const payload = await eventPromise;
		Assert.ok(payload.costSpent > 0, `Expected costSpent > 0, got ${payload.costSpent}`);
		Assert.strictEqual(payload.costSaved, 0, `Expected costSaved === 0, got ${payload.costSaved}`);
	});

	it("second call (cached): costSaved > 0, costSpent === 0", async () => {
		const eventPromise = waitForEvent<OpenAiCostTrackerSqliteEntry>(
			trackerSqlite, OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN
		);

		await openaiClient.embeddings.create({
			model: "text-embedding-3-small",
			input: "tracker embedding test",
		});

		const payload = await eventPromise;
		Assert.ok(payload.costSaved > 0, `Expected costSaved > 0, got ${payload.costSaved}`);
		Assert.strictEqual(payload.costSpent, 0, `Expected costSpent === 0, got ${payload.costSpent}`);
	});
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Tests: database persistence
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe("Tracker: database persistence", { skip: !hasApiKey ? "OPENAI_API_KEY not set" : false }, () => {

	it("getAllRecords returns records after tracked calls", async () => {
		const records = await trackerSqlite.getAllRecords();

		Assert.ok(records.length >= 6, `Expected at least 6 records, got ${records.length}`);
		for (const record of records) {
			Assert.ok(record.dateIso, "Expected dateIso to be defined");
			Assert.strictEqual(record.bucketId, BUCKET_ID);
			Assert.ok(record.modelName, "Expected modelName to be defined");
			Assert.ok(typeof record.costSpent === "number");
			Assert.ok(typeof record.costSaved === "number");
		}
	});

	it("getSummaryCosts returns correct aggregation", async () => {
		const summary = await trackerSqlite.getSummaryCosts();

		Assert.ok(summary.total.costSpent > 0, `Expected total.costSpent > 0, got ${summary.total.costSpent}`);
		Assert.ok(summary.total.costSaved > 0, `Expected total.costSaved > 0, got ${summary.total.costSaved}`);
		Assert.ok(summary.buckets.length > 0, "Expected at least one bucket");

		const bucket = summary.buckets.find(b => b.bucketId === BUCKET_ID);
		Assert.ok(bucket, `Expected bucket with id ${BUCKET_ID}`);
		Assert.ok(bucket!.costSpent > 0);
		Assert.ok(bucket!.costSaved > 0);
		Assert.ok(bucket!.models.length > 0, "Expected at least one model in bucket");
	});
});
