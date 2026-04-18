// node imports
import { EventEmitter } from "events";

// npm imports
import OpenAI from "openai";
import OpenAICache from "openai-cache";
import BetterSqlite3 from "better-sqlite3";

// local imports
import { OpenAiCostCalculator, OpenAiCostResponse } from "../../openai_cost_calculator";
import { OpenAiCostTrackerCallback } from "../../openai_cost_tracker";
import {
	OpenAiCostTrackerSqliteEntry,
	OpenAiCostTrackerSqliteBucketCost,
	OpenAiCostTrackerSqliteCostSummary,
	OpenAiCostTrackerSqliteModelCost
} from "./tracker_sqlite_type";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenAiCostTrackerSqlite Class
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * SQLite-backed cost tracker for OpenAI API calls.
 * Stores costs in a SQLite database with schema: dateIso, bucketId, modelName, costSpent, costSaved
 */
export class OpenAiCostTrackerSqlite extends EventEmitter {
	static EVENT = {
		BUCKET_WRITTEN: "bucket_written"
	}

	private _database: BetterSqlite3.Database;

	constructor(dbPath: string) {
		// call super constructor to initialize EventEmitter
		super()
		// Initialize database synchronously
		this._database = new BetterSqlite3(dbPath);
	}

	/**
	 * Initialize the database and create schema if needed
	 */
	async init(): Promise<void> {
		this._database.exec(`
			CREATE TABLE IF NOT EXISTS cost_tracking (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				dateIso TEXT NOT NULL,
				bucketId TEXT NOT NULL,
				modelName TEXT NOT NULL,
				costSpent REAL NOT NULL DEFAULT 0,
				costSaved REAL NOT NULL DEFAULT 0
			)
		`);
	}

	/**
	 * Close the database connection
	 */
	async close(): Promise<void> {
		this._database.close();
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Public Methods
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Get all individual cost tracking records from the database
	 */
	async getAllRecords(): Promise<OpenAiCostTrackerSqliteEntry[]> {
		const stmt = this._database.prepare(
			"SELECT dateIso, bucketId, modelName, costSpent, costSaved FROM cost_tracking ORDER BY dateIso DESC"
		);
		return stmt.all() as OpenAiCostTrackerSqliteEntry[];
	}

	/**
	 * Get a JSON summary of costs grouped by bucket and model using SQL aggregation
	 */
	async getSummaryCosts(): Promise<OpenAiCostTrackerSqliteCostSummary> {
		// Get overall totals using SQL aggregation
		const totalStmt = this._database.prepare(
			"SELECT SUM(costSpent) as totalSpent, SUM(costSaved) as totalSaved FROM cost_tracking"
		);
		const totalRow = totalStmt.get() as { totalSpent: number | null; totalSaved: number | null };
		const totalSpent = totalRow?.totalSpent ?? 0;
		const totalSaved = totalRow?.totalSaved ?? 0;

		// Get breakdown by bucket and model using SQL grouping
		const breakdownStmt = this._database.prepare(
			"SELECT bucketId, modelName, SUM(costSpent) as costSpent, SUM(costSaved) as costSaved FROM cost_tracking GROUP BY bucketId, modelName ORDER BY bucketId, modelName"
		);
		const breakdownRows = breakdownStmt.all() as Array<{ bucketId: string; modelName: string; costSpent: number; costSaved: number }>;

		// Group breakdown by bucketId
		const byBucket = breakdownRows.reduce(
			(acc, row) => {
				if (!acc[row.bucketId]) {
					acc[row.bucketId] = { costSpent: 0, costSaved: 0, models: [] };
				}
				acc[row.bucketId].models.push({
					modelName: row.modelName,
					costSpent: row.costSpent,
					costSaved: row.costSaved
				});
				acc[row.bucketId].costSpent += row.costSpent;
				acc[row.bucketId].costSaved += row.costSaved;
				return acc;
			},
			{} as Record<string, { costSpent: number; costSaved: number; models: OpenAiCostTrackerSqliteModelCost[] }>
		);

		// Build buckets array
		const buckets: OpenAiCostTrackerSqliteBucketCost[] = Object.entries(byBucket).map(([bucketId, { costSpent, costSaved, models }]) => ({
			bucketId,
			costSpent,
			costSaved,
			models
		}));

		return {
			total: {
				costSpent: totalSpent,
				costSaved: totalSaved
			},
			buckets
		};
	}

	/**
	 * Get the tracker callback function for use with OpenAI cost tracker
	 */
	async getTrackerCallback(): Promise<OpenAiCostTrackerCallback> {
		return this._trackerCallback.bind(this);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Private Methods
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Callback to track OpenAI API costs and store in SQLite
	 * @param bucketId - identifier for grouping costs
	 * @param response - OpenAI API response
	 */
	private async _trackerCallback(bucketId: string,
		input: string | URL | Request,
		init: RequestInit | undefined,
		response: Response
	): Promise<void> {
		const contentType = response.headers.get("Content-Type")

		// get inputUrl
		let inputUrl: string | undefined;
		if (typeof input === "string") {
			inputUrl = input;
		} else if (input instanceof URL) {
			inputUrl = input.toString();
		} else if (input instanceof Request) {
			inputUrl = input.url;
		} else {
			throw new Error(`Unexpected input type in tracker callback for bucketId ${bucketId}: expected string, URL, or Request, got ${typeof input}`);
		}

		const isEmbeddingsEndpoint = inputUrl.endsWith("/embeddings");
		const isChatCompletionsEndpoint = inputUrl.endsWith("/chat/completions");


		// Try to parse content type to determine how to extract usage information, and handle accordingly
		if (contentType !== null) {
			// handle if content-type is text/event-stream (for streamed responses)
			if (contentType.includes("text/event-stream")) {
				if (isChatCompletionsEndpoint) {
					await this._trackerCallback_ChatCompletions_EventStream(bucketId, response);
				} else {
					await this._trackerCallback_Responses_EventStream(bucketId, response);
				}
				return
			}

			// handle if content-type is application/json (for non-streamed responses)
			if (contentType.includes("application/json") && isEmbeddingsEndpoint === false) {
				if (isChatCompletionsEndpoint) {
					await this._trackerCallback_ChatCompletions_ApplicationJson(bucketId, response);
				} else {
					await this._trackerCallback_Responses_ApplicationJson(bucketId, response);
				}
				return
			}

			// handle if content-type is application/json for embeddings endpoint (which has a different response format and does not include usage information, so we will not be able to track costs for it, but we can still log the calls for visibility)
			if (contentType.includes("application/json") && isEmbeddingsEndpoint === true) {
				await this._trackerCallback_Embeddings(bucketId, response);
				return;
			}
		}

		// notify the error
		throw new Error(`Unexpected content type in response for bucketId ${bucketId}: expected "application/json" or "text/event-stream", got ${contentType}`);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Callback to track OpenAI API costs and store in SQLite
	 * @param bucketId - identifier for grouping costs
	 * @param response - OpenAI API response
	 */
	private async _trackerCallback_Responses_EventStream(bucketId: string, response: Response): Promise<void> {
		// sanity check - ensure content type is text/event-stream, otherwise we may not be able to parse the response correctly
		const contentType = response.headers.get("Content-Type")
		if (contentType === null || contentType.includes("text/event-stream") !== true) {
			throw new Error(`Unexpected content type in response for bucketId ${bucketId}: expected "text/event-stream", got ${contentType}`);
		}

		if (response.body === null) {
			throw new Error(`Response body is null for bucketId ${bucketId}`);
		}

		// Parse response as json to extract model and usage info
		const streamReader = response.body!.getReader();
		const textDecoder = new TextDecoder();

		// Buffer to accumulate partial streaming data
		let receivedBuffer: string = "";

		// Loop through the stream until all data is received
		while (true) {
			// Read the next chunk from the stream
			const { done, value } = await streamReader.read();

			// Exit loop when stream is exhausted
			if (done) break;

			// Decode the binary chunk to text and append to buffer
			receivedBuffer += textDecoder.decode(value, {
				stream: true
			});

			// Split buffer by double newlines (SSE event separator)
			const eventContents = receivedBuffer.split("\n\n");

			// Keep the last incomplete event in buffer for next iteration
			receivedBuffer = eventContents.pop() || "";

			// Process each complete SSE event
			const eventNameReponseCompleted = "response.completed";
			for (const event of eventContents) {
				const eventLines = event.split("\n");
				// test if there is a line "event: response_completed\n" in the event content, which indicates the end of the stream 
				// and contains the usage information in the data field
				const isResponseCompletedEvent = eventLines.some(eventLine => eventLine.trim() === `event: ${eventNameReponseCompleted}`);
				// if not, continue to the next event
				if (isResponseCompletedEvent === false) continue;

				// try to find the data line in the event content, which contains the usage information in JSON format, and 
				// extract the usage information from it
				const dataLine = eventLines.find(line => line.startsWith("data: "));
				// if no data line found, throw an error
				if (dataLine === undefined) {
					throw new Error(`Could not find data line in "${eventNameReponseCompleted}" event for bucketId ${bucketId}`);
				}

				// parse the data line to extract the usage information in JSON format, and then extract the model name 
				// and usage information from it
				const dataJsonStr = dataLine.replace("data: ", "").trim();
				let responseCompletedEvent: OpenAI.Responses.ResponseCompletedEvent;
				try {
					responseCompletedEvent = JSON.parse(dataJsonStr);
				} catch (error) {
					throw new Error(`Could not parse data JSON in "${eventNameReponseCompleted}" event for bucketId ${bucketId}: ${error}`);
				}

				// extract model name and usage information from the data JSON
				const modelName = responseCompletedEvent.response?.model;
				const openaiResponseUsage: OpenAI.Responses.ResponseUsage | undefined = responseCompletedEvent.response?.usage;

				// if model name or usage information is missing, throw an error
				if (openaiResponseUsage === undefined || modelName === undefined) {
					console.error(`Could not extract usage information from data JSON in "${eventNameReponseCompleted}" event for bucketId ${bucketId}`);
					return;
				}

				// Check if response is from cache
				const isFromCache = response.headers.get(OpenAICache.MARK_RESPONSE_NAME) === "true";

				// Calculate cost from usage information
				const costResponse = await OpenAiCostCalculator.calculateLlmCost(modelName, openaiResponseUsage);

				// process the usage information (calculate cost and store in SQLite)
				await this._trackerCallbackPostProcess(bucketId, costResponse, modelName, isFromCache);
			}
		}
	}


	/**
	 * Parse a streamed chat.completions SSE response and track its cost.
	 * Chat.completions streams are a sequence of unnamed `data: {...}` JSON chunks terminated by `data: [DONE]`.
	 * Usage is only present when the caller (or our fetch wrapper) set `stream_options.include_usage = true`,
	 * and appears on the last chunk (with an empty `choices` array).
	 */
	private async _trackerCallback_ChatCompletions_EventStream(bucketId: string, response: Response): Promise<void> {
		const contentType = response.headers.get("Content-Type")
		if (contentType === null || contentType.includes("text/event-stream") !== true) {
			throw new Error(`Unexpected content type in response for bucketId ${bucketId}: expected "text/event-stream", got ${contentType}`);
		}

		if (response.body === null) {
			throw new Error(`Response body is null for bucketId ${bucketId}`);
		}

		const streamReader = response.body!.getReader();
		const textDecoder = new TextDecoder();

		let receivedBuffer: string = "";
		let lastModelName: string | undefined;
		let lastUsage: OpenAI.CompletionUsage | undefined;

		while (true) {
			const { done, value } = await streamReader.read();
			if (done) break;

			receivedBuffer += textDecoder.decode(value, { stream: true });

			const eventContents = receivedBuffer.split("\n\n");
			receivedBuffer = eventContents.pop() || "";

			for (const event of eventContents) {
				const eventLines = event.split("\n");
				const dataLine = eventLines.find(line => line.startsWith("data: "));
				if (dataLine === undefined) continue;

				const dataJsonStr = dataLine.replace("data: ", "").trim();
				// Skip the SSE terminator emitted by chat.completions streams
				if (dataJsonStr === "[DONE]") continue;

				let chunk: OpenAI.ChatCompletionChunk;
				try {
					chunk = JSON.parse(dataJsonStr);
				} catch (error) {
					throw new Error(`Could not parse data JSON in chat.completions stream for bucketId ${bucketId}: ${error}`);
				}

				if (chunk.model) lastModelName = chunk.model;
				if (chunk.usage) lastUsage = chunk.usage;
			}
		}

		if (lastUsage === undefined || lastModelName === undefined) {
			// Chat.completions streams only emit usage when `stream_options.include_usage` is true.
			// The fetch wrapper auto-injects this, so reaching here usually means the user bypassed it (e.g. by
			// passing a pre-built Request object) or the request body wasn't a JSON string.
			console.warn(`Could not extract usage from chat.completions stream for bucketId ${bucketId}. Pass \`stream_options: { include_usage: true }\` on the request.`);
			return;
		}

		const isFromCache = response.headers.get(OpenAICache.MARK_RESPONSE_NAME) === "true";
		const responsesUsage = OpenAiCostTrackerSqlite._chatUsageToResponsesUsage(lastUsage);
		const costResponse = await OpenAiCostCalculator.calculateLlmCost(lastModelName, responsesUsage);
		await this._trackerCallbackPostProcess(bucketId, costResponse, lastModelName, isFromCache);
	}

	/**
	 * Parse a non-streamed chat.completions JSON response and track its cost.
	 */
	private async _trackerCallback_ChatCompletions_ApplicationJson(bucketId: string, response: Response): Promise<void> {
		const contentType = response.headers.get("Content-Type")
		if (contentType === null || contentType.includes("application/json") !== true) {
			throw new Error(`Unexpected content type in response for bucketId ${bucketId}: expected "application/json", got ${contentType}`);
		}

		const responseBodyJson = await response.json().catch(() => null);
		const modelName: string | undefined = responseBodyJson?.model;
		const chatUsage: OpenAI.CompletionUsage | undefined = responseBodyJson?.usage;

		if (chatUsage === undefined || modelName === undefined) {
			console.warn(`Could not extract usage information from chat.completions response for trackerId ${bucketId}`);
			return;
		}

		const isFromCache = response.headers.get(OpenAICache.MARK_RESPONSE_NAME) === "true";
		const responsesUsage = OpenAiCostTrackerSqlite._chatUsageToResponsesUsage(chatUsage);
		const costResponse = await OpenAiCostCalculator.calculateLlmCost(modelName, responsesUsage);
		await this._trackerCallbackPostProcess(bucketId, costResponse, modelName, isFromCache);
	}

	/**
	 * Convert a chat.completions `CompletionUsage` to the `Responses.ResponseUsage` shape expected by the calculator.
	 *
	 * The calculator bills `input_tokens` at the full input rate and `input_tokens_details.cached_tokens` at the
	 * cache rate separately, so `input_tokens` must be the NON-cached portion. Chat.completions' `prompt_tokens`
	 * *includes* cached tokens, so we subtract.
	 */
	private static _chatUsageToResponsesUsage(chatUsage: OpenAI.CompletionUsage): OpenAI.Responses.ResponseUsage {
		const cachedTokens = chatUsage.prompt_tokens_details?.cached_tokens ?? 0;
		const reasoningTokens = chatUsage.completion_tokens_details?.reasoning_tokens ?? 0;

		return {
			input_tokens: chatUsage.prompt_tokens - cachedTokens,
			output_tokens: chatUsage.completion_tokens,
			total_tokens: chatUsage.total_tokens,
			input_tokens_details: { cached_tokens: cachedTokens },
			output_tokens_details: { reasoning_tokens: reasoningTokens },
		};
	}

	/**
	 * Callback to track OpenAI API costs and store in SQLite
	 * @param bucketId - identifier for grouping costs
	 * @param response - OpenAI API response
	 */
	private async _trackerCallback_Responses_ApplicationJson(bucketId: string, response: Response): Promise<void> {
		// sanity check - ensure content type is application/json, otherwise we may not be able to parse the response correctly
		const contentType = response.headers.get("Content-Type")
		if (contentType === null || contentType.includes("application/json") !== true) {
			throw new Error(`Unexpected content type in response for bucketId ${bucketId}: expected "application/json", got ${contentType}`);
		}

		// Parse response as json to extract model and usage info
		const responseBodyJson = await response.json().catch(() => null);
		const modelName = responseBodyJson?.model;
		const openaiResponseUsage: OpenAI.Responses.ResponseUsage | undefined = responseBodyJson?.usage;

		if (openaiResponseUsage === undefined || modelName === undefined) {
			console.warn(`Could not extract usage information from response for trackerId ${bucketId}`);
			return;
		}

		// Check if response is from cache
		const isFromCache = response.headers.get(OpenAICache.MARK_RESPONSE_NAME) === "true";

		// Calculate cost from usage information
		const costResponse = await OpenAiCostCalculator.calculateLlmCost(modelName, openaiResponseUsage);

		// process the usage information (calculate cost and store in SQLite)
		await this._trackerCallbackPostProcess(bucketId, costResponse, modelName, isFromCache);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	private async _trackerCallback_Embeddings(bucketId: string, response: Response): Promise<void> {
		// sanity check - ensure content type is application/json, otherwise we may not be able to parse the response correctly
		const contentType = response.headers.get("Content-Type")
		if (contentType === null || contentType.includes("application/json") !== true) {
			throw new Error(`Unexpected content type in response for bucketId ${bucketId}: expected "application/json", got ${contentType}`);
		}

		// Parse response as json to extract model and usage info
		const responseBodyJson = await response.json().catch(() => null);
		const modelName: string | undefined = responseBodyJson?.model;
		const openaiEmbeddingUsage: OpenAI.Embeddings.CreateEmbeddingResponse.Usage | undefined = responseBodyJson?.usage;

		if (openaiEmbeddingUsage === undefined || modelName === undefined) {
			console.warn(`Could not extract usage information from response for trackerId ${bucketId}`);
			return;
		}

		// Check if response is from cache
		const isFromCache = response.headers.get(OpenAICache.MARK_RESPONSE_NAME) === "true";

		// Calculate cost from usage information
		const costResponse = await OpenAiCostCalculator.calculateEmbeddingCost(modelName, openaiEmbeddingUsage);

		// process the usage information (calculate cost and store in SQLite)
		await this._trackerCallbackPostProcess(bucketId, costResponse, modelName, isFromCache);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Callback to track OpenAI API costs and store in SQLite
	 * @param bucketId - identifier for grouping costs
	 * @param response - OpenAI API response
	 */
	private async _trackerCallbackPostProcess(
		bucketId: string,
		costResponse: OpenAiCostResponse,
		modelName: string,
		isFromCache: boolean
	): Promise<void> {
		// Get current timestamp in full ISO 8601 format
		const dateIso = new Date().toISOString();
		const costAmount = costResponse.totalCost;
		const [costSpent, costSaved] = isFromCache ? [0, costAmount] : [costAmount, 0];

		// Emit an event with the cost information for this bucketId, so that other parts of the application can react to it if needed
		const eventPayload: OpenAiCostTrackerSqliteEntry = {
			dateIso,
			bucketId,
			modelName,
			costSpent,
			costSaved
		}
		this.emit(OpenAiCostTrackerSqlite.EVENT.BUCKET_WRITTEN, eventPayload);
		// Append new record to database
		const insertStmt = this._database.prepare(
			"INSERT INTO cost_tracking (dateIso, bucketId, modelName, costSpent, costSaved) VALUES (?, ?, ?, ?, ?)"
		);
		insertStmt.run(dateIso, bucketId, modelName, costSpent, costSaved);
	}
}


