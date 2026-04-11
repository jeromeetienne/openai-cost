// Node imports
import Path from "node:path";

// NPM imports
import OpenAI from "openai";
import OpenAICache from "openai-cache";
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";
import Chalk from "chalk";

// Local imports
import { OpenAiCostCalculator } from "../src/openai_cost_calculator";

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
	const openaiCache = new OpenAICache(sqliteCache);

	await openaiCache.cleanCache(); // clean the cache before starting the example

	// init OpenAI client with caching fetch
	const openaiClient = new OpenAI({
		fetch: openaiCache.getFetchFn()
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	async function doCallNoStream() {
		const prompt = `say hello`
		const modelName = 'gpt-4.1-nano';

		const callStart = Date.now();


		// Make a streamed API call - with no streaming, to get the response usage and calculate the cost of the API call using the OpenAiCostCalculator
		const response = await openaiClient.responses.create({
			model: modelName,
			input: prompt,
		});
		// Get ResponseUsage from the response
		const openaiUsage: OpenAI.Responses.ResponseUsage = response.usage!

		// calculate the cost of the API call using the OpenAiCostCalculator
		console.log(`openai usage:`, openaiUsage);
		const costResponse = await OpenAiCostCalculator.calculateCost(modelName, openaiUsage);
		console.log(`cost response:`, costResponse);

		// display the cost of the API call
		console.log(`cost for this response: $${costResponse.totalCost.toFixed(6)} - ${(1 / costResponse.totalCost).toFixed(2)} call/usd`);

		const callElapsed = Date.now() - callStart;
		console.log(`duration: ${Chalk.cyan(callElapsed)} ms`);

		return { openaiUsage, costResponse, callElapsed }
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	do calls
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	console.log('----------------------------------')
	console.log(`making first API call (NOT from cache)...`);
	const { openaiUsage: call1OpenaiUsage, costResponse: call1CostResponse, callElapsed: call1Elapsed } = await doCallNoStream();

	console.log('----------------------------------')
	console.log(`making second API call (should be from cache)...`);
	const { openaiUsage: call2OpenaiUsage, costResponse: call2CostResponse, callElapsed: call2Elapsed } = await doCallNoStream();

	console.log('----------------------------------')
	console.log(`Cached call should be much faster than the non-cached call.`);
	const speedupFactor = call1Elapsed / call2Elapsed;
	console.log(`speedup factor: ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
}


void main();