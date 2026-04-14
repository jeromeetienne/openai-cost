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


		// Try to parse content type to determine how to extract usage information, and handle accordingly
		if (contentType !== null) {
			// handle if content-type is text/event-stream (for streamed responses)
			if (contentType.includes("text/event-stream")) {
				await this._trackerCallback_Responses_EventStream(bucketId, response);
				return
			}

			// handle if content-type is application/json (for non-streamed responses)
			if (contentType.includes("application/json") && isEmbeddingsEndpoint === false) {
				await this._trackerCallback_Responses_ApplicationJson(bucketId, response);
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
				// FIXME this works IIF using .responses API
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
			debugger
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


