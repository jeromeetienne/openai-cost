// node imports
import Path from "node:path";

// npm imports
import OpenAI from "openai";
import Chalk from "chalk";

// local imports
import { OpenAiCostTracker } from "../src/openai_cost_tracker";
import { OpenAiCostTrackerSqlite } from "../src/trackers/tracker_sqlite/tracker_sqlite";
import { OpenAiSqliteCostSummaryHelper } from "../src/trackers/tracker_sqlite/tracker_sqlite_cost_summary";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Multi-provider tracking example
//
//	Hits up to 4 different OpenAI-compatible providers in a single bucket so
//	you can see them tracked side-by-side with auto-detected provider tags.
//	Each provider is enabled only when its credentials/server are available.
//
//	OPENAI_API_KEY            -> hit api.openai.com
//	GEMINI_API_KEY            -> hit Gemini's OpenAI-compatible endpoint
//	OLLAMA_BASE_URL or :11434 -> hit local Ollama
//	LMSTUDIO_BASE_URL or :1234-> hit local LMStudio
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const BUCKET_ID = 'bucket-multi-provider-example';

type ProviderRun = {
	label: string;
	baseURL?: string;
	apiKey: string;
	model: string;
};

async function main() {
	// init the tracker SQLite to store tracked costs from the multi-provider calls
	const dbFilePath = Path.resolve(__dirname, './.openai_cost_tracker_multi_provider.sqlite');
	const trackerSqlite = new OpenAiCostTrackerSqlite(dbFilePath);
	await trackerSqlite.init();

	const onExit = async () => {
		await trackerSqlite.close();
	};
	process.on('SIGINT', onExit);
	process.on('SIGTERM', onExit);

	// Build the tracking fetch — single instance reused across every provider's client.
	const fetchWithTracking = await OpenAiCostTracker.getFetchFn(
		await trackerSqlite.getTrackerCallback(),
		{ bucketId: BUCKET_ID }
	);

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Build the list of providers to exercise (only those with credentials/servers)
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	const providerRuns: ProviderRun[] = [];

	if (process.env.OPENAI_API_KEY) {
		providerRuns.push({
			label: 'openai',
			apiKey: process.env.OPENAI_API_KEY,
			model: 'gpt-4.1-nano',
		});
	} else {
		console.log(Chalk.gray('[skip] OPENAI_API_KEY not set — skipping OpenAI call'));
	}

	if (process.env.GEMINI_API_KEY) {
		providerRuns.push({
			label: 'gemini',
			baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
			apiKey: process.env.GEMINI_API_KEY,
			model: 'gemini-2.5-flash',
		});
	} else {
		console.log(Chalk.gray('[skip] GEMINI_API_KEY not set — skipping Gemini call'));
	}

	const ollamaBaseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
	providerRuns.push({
		label: 'ollama',
		baseURL: ollamaBaseURL,
		apiKey: 'ollama-no-key-needed',
		// Override OLLAMA_MODEL if you don't have llama3.2 pulled
		model: process.env.OLLAMA_MODEL ?? 'llama3.2:1b',
	});

	const lmstudioBaseURL = process.env.LMSTUDIO_BASE_URL ?? 'http://localhost:1234/v1';
	providerRuns.push({
		label: 'lmstudio',
		baseURL: lmstudioBaseURL,
		apiKey: 'lmstudio-no-key-needed',
		// LMStudio model IDs depend on what you've loaded; override via env if needed
		model: process.env.LMSTUDIO_MODEL ?? 'local-model',
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Make one chat.completions call per provider
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	for (const run of providerRuns) {
		console.log();
		console.log(Chalk.yellow(`=== ${run.label} ===`));
		console.log(Chalk.gray(`baseURL: ${run.baseURL ?? 'https://api.openai.com/v1 (default)'}`));
		console.log(Chalk.gray(`model:   ${run.model}`));

		const client = new OpenAI({
			apiKey: run.apiKey,
			baseURL: run.baseURL,
			fetch: fetchWithTracking,
			timeout: 60_000,
		});

		try {
			// Use chat.completions for max compatibility: Gemini's OpenAI-compatible endpoint, Ollama
			// and LMStudio all support /chat/completions; only some of them support /responses.
			const response = await client.chat.completions.create({
				model: run.model,
				messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
			});

			const text = response.choices?.[0]?.message?.content ?? '<no content>';
			console.log(Chalk.green(`reply:`), text.trim());
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.log(Chalk.red(`[error] ${run.label} call failed:`), message);
			console.log(Chalk.gray(`(this is fine if the local server is not running or the model is not pulled)`));
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Print the per-provider summary
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	console.log();
	console.log(Chalk.yellow('=== tracked summary ==='));
	const summary = await trackerSqlite.getSummaryCosts();
	const printed = await OpenAiSqliteCostSummaryHelper.costSummaryPrint(summary);
	console.log(printed);

	await trackerSqlite.close();
}

void main();
