// Node imports
import Path from "node:path";

// NPM imports
import OpenAI from "openai";
import OpenAICache from "openai-cache";
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";
// local imports
import { OpenAiCostCalculator } from "../src/openai_cost_calculator";
import { OpenAICallTracker } from "../src/openai_call_tracker";
import { OpenAICostSampleDb} from "./sample_db/sample_db";

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
	//	init the sample db to store tracked costs from the OpenAICallTracker
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	// init the sample db to store tracked costs from the OpenAICallTracker
	const dbFilePath = Path.resolve(__dirname, `./.openai_cost_sample_db.json`);
	const sampleDb = new OpenAICostSampleDb(dbFilePath);
	await sampleDb.init();

	// on process exit, we want to save the tracked db to the file
	const onExit = async () => {
		await sampleDb.destroy();
	}
	process.on('SIGINT', onExit);
	process.on('SIGTERM', onExit);

	// Build the fetch function with tracking capabilities, using the OpenAICache fetch as the original fetch implementation
	const fetchWithTracking = await OpenAICallTracker.getFetchFn(sampleDb.getTrackedCallback(), {
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
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	const prompt = `say hello`
	const modelName = 'gpt-4.1-nano';

	console.log(`making first API call...`);
	const response1 = await openaiClient.responses.create({
		model: modelName,
		input: prompt,
	});

	console.log(`making second API call (should be from cache)...`);
	const response2 = await openaiClient.responses.create({
		model: modelName,
		input: prompt,
	});

	// display cost per call
	const openaiUsage1: OpenAI.Responses.ResponseUsage = response1.usage!
	const costResponse1 = await OpenAiCostCalculator.calculateCost(modelName, openaiUsage1);
	console.log(`cost per call:`, costResponse1);

	// display tracked costs in the sample db
	console.log(`trackedDb:`, sampleDb.getStorage());

	// save the tracked costs to a file
	await sampleDb.saveToFile();
}


void main();