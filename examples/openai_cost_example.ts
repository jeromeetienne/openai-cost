// Node imports
import Path from "node:path";

// NPM imports
import OpenAI from "openai";
import OpenAICache from "openai-cache";
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";
import { OpenAiCostCalculator } from "../src/openai_cost_calculator";
import Chalk from "chalk";

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
		const costResponse = await OpenAiCostCalculator.calculateCost(modelName, openaiUsage);
		console.log(`openai usage:`, JSON.stringify(openaiUsage));
		console.log(`cost response:`, JSON.stringify(costResponse));

		// display the cost of the API call
		console.log(`cost for this response: $${costResponse.totalCost.toFixed(6)} - ${(1 / costResponse.totalCost).toFixed(2)} call/usd`);

		const callElapsed = Date.now() - callStart;
		console.log(`duration: ${Chalk.cyan(callElapsed)} ms`);

		return { openaiUsage, costResponse, callElapsed }
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	async function doCallStreamed() {
		const prompt = `say hello`
		const modelName = 'gpt-4.1-nano';

		const callStart = Date.now();

		const responseStreamEvents1 = await openaiClient.responses.create({
			model: modelName,
			input: prompt,
			stream: true,
		});

		// Get ResponseUsage from the response
		// Note: with streamed responses, the usage is only available in the final event of the stream, which is the ResponseCompletedEvent
		// so we will consume the stream events until we get to the final event, and then get the usage from there

		// consume all the events from the response stream, which will trigger the cost tracking in the OpenAICallTracker
		let responseStreamEvent1: OpenAI.Responses.ResponseStreamEvent
		for await (responseStreamEvent1 of responseStreamEvents1) {
			// console.log(`- streamed event type: ${responseStreamEvent1.type} - ${JSON.stringify(responseStreamEvent1)}`);
			process.stdout.write(`.`);
		}
		process.stdout.write(`\n`);

		// Get ResponseUsage from the final response event
		const responseCompletedEvent = responseStreamEvent1! as OpenAI.Responses.ResponseCompletedEvent;
		const openaiUsage: OpenAI.Responses.ResponseUsage = responseCompletedEvent.response.usage!

		// calculate the cost of the API call using the OpenAiCostCalculator
		const costResponse = await OpenAiCostCalculator.calculateCost(modelName, openaiUsage);
		console.log(`openai usage:`, JSON.stringify(openaiUsage));
		console.log(`cost response:`, JSON.stringify(costResponse));

		// display the cost of the API call
		console.log(`cost for this response: $${costResponse.totalCost.toFixed(6)} - ${(1 / costResponse.totalCost).toFixed(2)} call/usd`);

		const callElapsed = Date.now() - callStart;
		console.log(`duration: ${Chalk.cyan(callElapsed)} ms`);

		return { openaiUsage, costResponse, callElapsed }
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	do calls nostream
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	if (true) {
		console.log()
		console.log(Chalk.yellow(`==================================`));
		console.log(`${Chalk.yellow('Making non-streamed API calls to calculate cost with OpenAiCostCalculator')}`);

		// clean the cache before starting 
		await openaiCache.cleanCache();

		console.log()
		console.log(`--- ${Chalk.magenta('First call (nostream) (should not be in the cache)')} ---`)
		const { openaiUsage: call1OpenaiUsage, costResponse: call1CostResponse, callElapsed: call1Elapsed } = await doCallNoStream();

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (nostream) (should be from the cache)')} ---`)
		const { openaiUsage: call2OpenaiUsage, costResponse: call2CostResponse, callElapsed: call2Elapsed } = await doCallNoStream();

		console.log()
		console.log(`--- ${Chalk.magenta('Result (nostream)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call.`);
		const speedupFactor = call1Elapsed / call2Elapsed;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	do calls streamed
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	if (true) {
		console.log()
		console.log(Chalk.yellow(`==================================`));
		console.log(`${Chalk.yellow('Making streamed API calls to calculate cost with OpenAiCostCalculator')}`);

		// clean the cache before starting 
		await openaiCache.cleanCache();

		console.log()
		console.log(`--- ${Chalk.magenta('First call (streamed) (should not be in the cache)')} ---`)
		const { openaiUsage: call1OpenaiUsage, costResponse: call1CostResponse, callElapsed: call1Elapsed } = await doCallStreamed();

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (streamed) (should be from the cache)')} ---`)
		const { openaiUsage: call2OpenaiUsage, costResponse: call2CostResponse, callElapsed: call2Elapsed } = await doCallStreamed();

		console.log()
		console.log(`--- ${Chalk.magenta('Result (streamed)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call. Call's cost should be the same (as it is not tracked)`);
		const speedupFactor = call1Elapsed / call2Elapsed;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
		const costDifference = call1CostResponse.totalCost - call2CostResponse.totalCost;
		console.log(`cost difference (between calls): $${costDifference.toFixed(6)}`);
	}
}


void main();