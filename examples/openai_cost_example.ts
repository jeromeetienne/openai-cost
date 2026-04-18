// Node imports
import Path from "node:path";

// NPM imports
import OpenAI from "openai";
import OpenAICache from "openai-cache";
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";
import Chalk from "chalk";

// local imports
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
	const openaiCache = new OpenAICache(sqliteCache);

	// init OpenAI client with caching fetch
	const openaiClient = new OpenAI({
		fetch: openaiCache.getFetchFn()
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	do calls nostream
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	if (true) {
		console.log()
		console.log(Chalk.yellow(`==================================`));
		console.log(`${Chalk.yellow('Making non-streamed API calls to calculate cost (non-cache-tracked)')}`);

		// clean the cache before starting 
		await openaiCache.cleanCache();

		console.log()
		console.log(`--- ${Chalk.magenta('First call (nostream) (NOT from cache)')} ---`)
		const response1 = await ExampleHelper.doCallNoStream(openaiClient);

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (nostream) (IS from cache)')} ---`)
		const response2 = await ExampleHelper.doCallNoStream(openaiClient);

		console.log()
		console.log(`--- ${Chalk.magenta('Result (nostream)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call.`);
		const speedupFactor = response1.callElapsed / response2.callElapsed;
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
		console.log(`${Chalk.yellow('Making streamed API calls to calculate cost (non-cache-tracked)')}`);

		// clean the cache before starting 
		await openaiCache.cleanCache();

		console.log()
		console.log(`--- ${Chalk.magenta('First call (streamed) (NOT from cache)')} ---`)
		const response1 = await ExampleHelper.doCallStreamed(openaiClient);

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (streamed) (IS from cache)')} ---`)
		const response2 = await ExampleHelper.doCallStreamed(openaiClient);

		console.log()
		console.log(`--- ${Chalk.magenta('Result (streamed)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call. Call's cost should be the same (as it is not tracked)`);
		const speedupFactor = response1.callElapsed / response2.callElapsed;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
		const costDifference = response1.costResponse.totalCost - response2.costResponse.totalCost;
		console.log(`cost difference (between calls): $${costDifference.toFixed(6)}`);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	do calls embeddings
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	if (true) {
		console.log()
		console.log(Chalk.yellow(`==================================`));
		console.log(`${Chalk.yellow('Making embedding API calls to calculate cost (non-cache-tracked)')}`);

		// clean the cache before starting 
		await openaiCache.cleanCache();

		console.log()
		console.log(`--- ${Chalk.magenta('First call (NOT from cache)')} ---`)
		const response1 = await ExampleHelper.doCallEmbedding(openaiClient);

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (IS from cache)')} ---`)
		const response2 = await ExampleHelper.doCallEmbedding(openaiClient);

		console.log()
		console.log(`--- ${Chalk.magenta('Result')} ---`);
		console.log(`Cached call should be much faster than the non-cached call.`);
		const speedupFactor = response1.callElapsed / response2.callElapsed;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
	}
}


void main();