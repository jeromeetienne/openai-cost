// node imports
import Path from "node:path";
import Assert from "node:assert";

// npm imports
import OpenAI from "openai";
import OpenAICache from "openai-cache";
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";
import Chalk from "chalk";

// local imports
import { OpenAiCostCalculator } from "../src/openai_cost_calculator";
import { OpenAICallTracker } from "../src/openai_call_tracker";
import { OpenAiCostTrackerSqlite, OpenAiCostTrackerSqliteEntry } from "../src/trackers/tracker_sqlite/tracker_sqlite";
import { ExampleHelper } from "./libs/example_helper";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

async function main() {

	// init a cacheable instance
	// - here it is backed by a sqlite database, but you can use any Keyv storage backend (redis, filesystem, etc)
	const sqlitePath = `sqlite://${Path.resolve(__dirname, `./.openai_cache.sqlite`)}`;
	const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(sqlitePath) });

	// init the OpenAICache with the cacheable instance
	const openaiCache = new OpenAICache(sqliteCache, {
		markResponseEnabled: true, // this will add a custom header to the response to indicate if it was from the cache or not
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	init the tracker sqlite to store tracked costs from the OpenAICallTracker
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	// init the tracker SQLite to store tracked costs from the OpenAICallTracker
	const dbFilePath = Path.resolve(__dirname, `./.openai_cost_tracker.sqlite`);
	const trackerSqlite = new OpenAiCostTrackerSqlite(dbFilePath);
	await trackerSqlite.init();

	// on process exit, we want to save the tracked db to the file
	const onExit = async () => {
		await trackerSqlite.close();
	}
	process.on('SIGINT', onExit);
	process.on('SIGTERM', onExit);

	// Build the fetch function with tracking capabilities, using the OpenAICache fetch as the original fetch implementation
	const fetchWithTracking = await OpenAICallTracker.getFetchFn(await trackerSqlite.getTrackerCallback(), {
		bucketId: `bucket-openai-cost-tracker-sqlite-example`,
		originalFetch: openaiCache.getFetchFn(),
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	// init OpenAI client with caching fetch
	const openaiClient = new OpenAI({
		// use the fetch function with tracking capabilities in the OpenAI client
		fetch: fetchWithTracking,
		// increased timeout to ease debugging
		timeout: 60_000,
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	function onBucketWrittenExpectCostSpent(eventPayload: OpenAiCostTrackerSqliteEntry) {
		console.log(Chalk.blue(`[Event - ${OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN}]`), eventPayload);

		// sanity check - cost MUST be spent (and not saved) when the cost is not from cache, otherwise there is a bug in the tracking logic
		Assert.ok(eventPayload.costSpent > 0, `Expected costSpent to be > 0 for bucket written event, got ${eventPayload.costSpent}`);
		Assert.ok(eventPayload.costSaved === 0, `Expected costSaved to be 0 for bucket written event when cost is not from cache, got ${eventPayload.costSaved}`);
	}
	function onBucketWrittenExpectCostSaved(eventPayload: OpenAiCostTrackerSqliteEntry) {
		console.log(Chalk.blue(`[Event - ${OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN}]`), eventPayload);

		// sanity check - cost MUST be saved (and not spent) when the cost is from cache, otherwise there is a bug in the tracking logic
		Assert.ok(eventPayload.costSaved > 0, `Expected costSaved to be > 0 for bucket written event, got ${eventPayload.costSaved}`);
		Assert.ok(eventPayload.costSpent === 0, `Expected costSpent to be 0 for bucket written event when cost is from cache, got ${eventPayload.costSpent}`);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	do calls nostream
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	if (true) {
		console.log()
		console.log(Chalk.yellow(`==================================`));
		console.log(`${Chalk.yellow('Making nostream API calls to calculate cost (tracked)')}`);

		// clean the cache before starting 
		await openaiCache.cleanCache();

		console.log()
		console.log(`--- ${Chalk.magenta('First call (nostream) (NOT CACHED)')} ---`)
		trackerSqlite.addListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSpent);
		const response1 = await ExampleHelper.doCallNoStream(openaiClient);
		trackerSqlite.removeListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSpent);

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (nostream) (IN CACHE)')} ---`)
		trackerSqlite.addListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSaved);
		const response2 = await ExampleHelper.doCallNoStream(openaiClient);
		trackerSqlite.removeListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSaved);

		console.log()
		console.log(`--- ${Chalk.magenta('Result (nostream)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call.`);
		const speedupFactor = response1.callElapsed / response2.callElapsed;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
		const costDifference = response1.costResponse.totalCost - response2.costResponse.totalCost;
		console.log(`cost difference (between calls)(not cache tracked): $${costDifference}`);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	do calls streamed
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////


	if (true) {
		console.log()
		console.log(Chalk.yellow(`==================================`));
		console.log(`${Chalk.yellow('Making streamed API calls to calculate cost (non-tracked)')}`);

		// clean the cache before starting 
		await openaiCache.cleanCache();

		console.log()
		console.log(`--- ${Chalk.magenta('First call (streamed) (NOT CACHED)')} ---`)
		trackerSqlite.addListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSpent);
		const response1 = await ExampleHelper.doCallStreamed(openaiClient);
		trackerSqlite.removeListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSpent);

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (streamed) (IN CACHE)')} ---`)
		trackerSqlite.addListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSaved);
		const response2 = await ExampleHelper.doCallStreamed(openaiClient);
		trackerSqlite.removeListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSaved);

		console.log()
		console.log(`--- ${Chalk.magenta('Result (streamed)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call. Call's cost should be the same (as it is not tracked)`);
		const speedupFactor = response1.callElapsed / response2.callElapsed;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
		const costDifference = response1.costResponse.totalCost - response2.costResponse.totalCost;
		console.log(`cost difference (between calls)(not cache tracked): $${costDifference}`);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	do call embedding
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	if (true) {
		console.log()
		console.log(Chalk.yellow(`==================================`));
		console.log(`${Chalk.yellow('Making embedding API calls to calculate cost (tracked)')}`);

		// clean the cache before starting 
		await openaiCache.cleanCache();

		console.log()
		console.log(`--- ${Chalk.magenta('First call (embedding) (NOT CACHED)')} ---`)
		trackerSqlite.addListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSpent);
		const response1 = await ExampleHelper.doCallEmbedding(openaiClient);
		trackerSqlite.removeListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSpent);

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (embedding) (IN CACHE)')} ---`)
		trackerSqlite.addListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSaved);
		const response2 = await ExampleHelper.doCallEmbedding(openaiClient);
		trackerSqlite.removeListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSaved);

		console.log()
		console.log(`--- ${Chalk.magenta('Result (embedding)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call.`);
		const speedupFactor = response1.callElapsed / response2.callElapsed;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
		const costDifference = response1.costResponse.totalCost - response2.costResponse.totalCost;
		console.log(`cost difference (between calls)(not cache tracked): $${costDifference}`);
	}


	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	// save the tracked costs to a file
	await trackerSqlite.close();
}


void main();