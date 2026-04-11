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
	// await openaiCache.cleanCache(); // clean the cache before starting the example

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
		bucketId: `bucket-example`,
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
	//	function doCallNoStream() - makes a non-streamed API call
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	async function doCallNoStream() {
		const prompt = `hello world`
		const modelName = 'gpt-4.1-nano';

		// measure call start time
		const callStart = Date.now();

		console.log(`making first API call...`);
		const response1 = await openaiClient.responses.create({
			model: modelName,
			input: prompt,
		});

		// calculate the cost of the API call using the OpenAiCostCalculator
		const openaiUsage: OpenAI.Responses.ResponseUsage = response1.usage!
		const costResponse = await OpenAiCostCalculator.calculateCost(modelName, openaiUsage);
		// measure call elapsed time
		const callElapsed = Date.now() - callStart;

		// display info about the call
		console.log(`openai usage:`, JSON.stringify(openaiUsage));
		console.log(`cost response (cache untracked):`, JSON.stringify(costResponse));
		console.log(`cost for this response (cache untracked): $${costResponse.totalCost.toFixed(6)} - ${(1 / costResponse.totalCost).toFixed(2)} call/usd`);
		console.log(`duration: ${Chalk.cyan(callElapsed)} ms`);

		// return the usage, cost response and elapsed time for this call
		return { openaiUsage, costResponse, callElapsed }
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	function doCallStreamed() - makes a streamed API call
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	async function doCallStreamed() {
		const prompt = `hello world`
		const modelName = 'gpt-4.1-nano';

		// measure call start time
		const callStart = Date.now();

		// Make a streamed API call - with streaming, to get the response usage and calculate the cost of the API call using the OpenAiCostCalculator
		const responseStreamEvents = await openaiClient.responses.create({
			model: modelName,
			input: prompt,
			stream: true,
		});

		// Get ResponseUsage from the response
		// Note: with streamed responses, the usage is only available in the final event of the stream, which is the ResponseCompletedEvent
		// so we will consume the stream events until we get to the final event, and then get the usage from there

		// consume all the events from the response stream, which will trigger the cost tracking in the OpenAICallTracker
		let responseStreamEvent: OpenAI.Responses.ResponseStreamEvent
		for await (responseStreamEvent of responseStreamEvents) {
			// console.log(`- streamed event type: ${responseStreamEvent.type} - ${JSON.stringify(responseStreamEvent)}`);
			process.stdout.write(`.`);
		}
		process.stdout.write(`\n`);

		// Get ResponseUsage from the final response event
		const responseCompletedEvent = responseStreamEvent! as OpenAI.Responses.ResponseCompletedEvent;
		const openaiUsage: OpenAI.Responses.ResponseUsage = responseCompletedEvent.response.usage!

		// calculate the cost of the API call using the OpenAiCostCalculator
		const costResponse = await OpenAiCostCalculator.calculateCost(modelName, openaiUsage);
		// measure call elapsed time
		const callElapsed = Date.now() - callStart;

		// display info about the call
		console.log(`openai usage:`, JSON.stringify(openaiUsage));
		console.log(`cost response (cache untracked):`, JSON.stringify(costResponse));
		console.log(`cost for this response (cache untracked): $${costResponse.totalCost.toFixed(6)} - ${(1 / costResponse.totalCost).toFixed(2)} call/usd`);
		console.log(`duration: ${Chalk.cyan(callElapsed)} ms`);

		// return the usage, cost response and elapsed time for this call
		return { openaiUsage, costResponse, callElapsed }
	}

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
		const { openaiUsage: call1OpenaiUsage, costResponse: call1CostResponse, callElapsed: call1Elapsed } = await doCallNoStream();
		trackerSqlite.removeListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSpent);

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (nostream) (IN CACHE)')} ---`)
		trackerSqlite.addListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSaved);
		const { openaiUsage: call2OpenaiUsage, costResponse: call2CostResponse, callElapsed: call2Elapsed } = await doCallNoStream();
		trackerSqlite.removeListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSaved);

		console.log()
		console.log(`--- ${Chalk.magenta('Result (nostream)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call.`);
		const speedupFactor = call1Elapsed / call2Elapsed;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
		const costDifference = call1CostResponse.totalCost - call2CostResponse.totalCost;
		console.log(`cost difference (between calls): $${costDifference.toFixed(6)}`);
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
		const { openaiUsage: call1OpenaiUsage, costResponse: call1CostResponse, callElapsed: call1Elapsed } = await doCallStreamed();
		trackerSqlite.removeListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSpent);

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (streamed) (IN CACHE)')} ---`)
		trackerSqlite.addListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSaved);
		const { openaiUsage: call2OpenaiUsage, costResponse: call2CostResponse, callElapsed: call2Elapsed } = await doCallStreamed();
		trackerSqlite.removeListener(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, onBucketWrittenExpectCostSaved);

		console.log()
		console.log(`--- ${Chalk.magenta('Result (streamed)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call. Call's cost should be the same (as it is not tracked)`);
		const speedupFactor = call1Elapsed / call2Elapsed;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
		const costDifference = call1CostResponse.totalCost - call2CostResponse.totalCost;
		console.log(`cost difference (cost untracked): $${costDifference.toFixed(6)}`);
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