// Node imports
import Path from "node:path";

// NPM imports
import chalk from "chalk";
import OpenAI from "openai";
import OpenAICache from "openai-cache";
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";
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

	// init OpenAI client with caching fetch
	const openaiClient = new OpenAI({
		fetch: openaiCache.getFetchFn()
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	const modelNames = [
		'gpt-5.4',
		'gpt-5.2',
		'gpt-5-mini',
		'gpt-5-nano',
		'gpt-4.1',
		'gpt-4.1-mini',
		'gpt-4.1-nano'
	]

	for (const modelName of modelNames) {
		// make the call
		const response = await openaiClient.responses.create({
			model: modelName,
			input: `say hello`,
		});
		// get usage details from the response
		const openaiUsage: OpenAI.Responses.ResponseUsage = response.usage!

		// console.log(`openai model=${chalk.green(modelName)} usage:`, openaiUsage);
		const costResponse = await OpenAiCostCalculator.calculateCost(modelName, openaiUsage);

		// output results in a nice format - colored + vertically aligned
		console.log([
			`model: ${chalk.green(modelName.padEnd(12))}`,
			`$${chalk.yellow(costResponse.totalCost.toFixed(6))} /call -`,
			`${(1 / costResponse.totalCost).toFixed(2).padStart(10)} call/usd`
		].join(" "))
	}
}


void main();