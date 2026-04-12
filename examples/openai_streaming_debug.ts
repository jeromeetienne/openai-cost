// node imports
import Path from 'path';

// npm imports
import { Cacheable } from 'cacheable';
import KeyvSqlite from '@keyv/sqlite';
import { OpenAI } from 'openai';
import OpenAICache from 'openai-cache';

// local imports
import { OpenAICallTracker } from "../src/openai_call_tracker";
import { OpenAiCostTrackerSqlite, OpenAiCostTrackerSqliteEntry } from "../src/trackers/tracker_sqlite/tracker_sqlite";

const __dirname = new URL('.', import.meta.url).pathname;

async function main() {
	// initialize OpenAI client with caching
	const sqlitePath = `sqlite://${Path.resolve(__dirname, `./.openai_cache.sqlite`)}`;
	const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(sqlitePath) });
	const openaiCache = new OpenAICache(sqliteCache, {
		verboseLevel: 2, // enable verbose logging to see when cache is hit or missed
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


	const openaiClient = new OpenAI({
		// fetch: openaiCache.getFetchFn()
		fetch: fetchWithTracking
	});

	const stream = await openaiClient.chat.completions.create({
		model: "gpt-4o",
		messages: [
			{
				role: "user",
				content: "explain quantum theory in simple terms"
			},
		],
		stream: true,
	});

	for await (const chunk of stream) {
		const token = chunk.choices[0]?.delta?.content;
		if (token) process.stdout.write(token);
	}
}

main();