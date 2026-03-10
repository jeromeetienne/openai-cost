// Node imports
import Path from "node:path";

// NPM imports
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

	const prompt = `say hello`
	// const modelName = 'gpt-5-nano';
	// const modelName = 'gpt-5-mini';
	// const modelName = 'gpt-5.2';
	// const modelName = 'gpt-5.4';
	// const modelName = 'gpt-4.1'
	// const modelName = 'gpt-4.1-mini';
	const modelName = 'gpt-4.1-nano';

	const response = await openaiClient.responses.create({
		model: modelName,
		input: prompt,
	});

	const openaiUsage: OpenAI.Responses.ResponseUsage = response.usage!

	console.log(`openai usage:`, openaiUsage);
	const costResponse = await OpenAiCostCalculator.calculateCost(modelName, openaiUsage);
	console.log(`cost response:`, costResponse);

	console.log(`model: ${modelName}`);
	console.log(`cost for this response: $${costResponse.totalCost.toFixed(6)} - ${(1 / costResponse.totalCost).toFixed(2)} call/usd`);
}


void main();