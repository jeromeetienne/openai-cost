// Node imports
import Fs from "node:fs";

// NPM imports
import OpenAI from "openai";
import OpenAICache from "openai-cache";

// local imports
import { OpenAiCostCalculator, OpenAiCostResponse } from "../../openai_cost_calculator";
import { OpenAICallTrackerCallback } from "../../openai_call_tracker";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// Define the database to store tracked costs (in a real application, this could be a persistent database)
export type OpenAICostTrackerJsonEntry = {
	totalCost: number,
}

export type OpenAICostTrackerJsonStorage = {
	spent: Record<string, OpenAICostTrackerJsonEntry>;
	saved: Record<string, OpenAICostTrackerJsonEntry>;
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Example of a simple database to store tracked costs from the OpenAICallTracker. It is designed to be used in the openai_cost_tracker_example.ts 
 * example, but it can be adapted to be used in other contexts as well. It provides a simple interface to get a tracker callback function 
 * that can be passed to the OpenAICallTracker, and it handles the storage of tracked costs in memory and optionally saving/loading them from a file.
 */
export class OpenAICostTrackerJson {
	private _sampleStorage: OpenAICostTrackerJsonStorage = {
		spent: {},
		saved: {},
	}
	private _filePath?: string;

	/**
	 * Constructor for the OpenAICostTrackerJson class.
	 * @param filePath - Optional file path to load/save the tracked costs. If provided, the tracked costs will be loaded from this file 
	 * on initialization and saved to this file on exit. If not provided, the tracked costs will only be stored in memory and will 
	 * not persist across sessions.
	 */
	constructor(filePath?: string) {
		this._filePath = filePath
	}
	/**
	 * async initialisation function 
	 * - it load the tracked db from the file if the file path is provided
	 * - to set up an exit listener to save the tracked db to the file on exit
	 */
	async init() {
		// load the tracked db from the file if the file path is provided, otherwise we start with an empty db
		if (this._filePath !== undefined) {
			const fileExists = await Fs.promises.access(this._filePath).then(() => true).catch(() => false);
			if (fileExists) {
				const fileContent = await Fs.promises.readFile(this._filePath, 'utf-8')
				this._sampleStorage = JSON.parse(fileContent) as OpenAICostTrackerJsonStorage;
			}
		}
	}

	async close(): Promise<void> {
		// save the tracked db to the file on exit if the file path is provided
		if (this._filePath !== undefined) {
			await this.saveToFile();
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Public function
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	async saveToFile() {
		// if there is no file path, we can't save the tracked db, so we log a warning and return
		if (this._filePath === undefined) return

		// save the tracked db to the file
		const fileContent = JSON.stringify(this._sampleStorage, null, 2);
		await Fs.promises.writeFile(this._filePath, fileContent, 'utf-8');
	}

	async getStorage(): Promise<OpenAICostTrackerJsonStorage> {
		return this._sampleStorage;
	}

	async getTrackerCallback(): Promise<OpenAICallTrackerCallback> {
		return this._trackerCallback.bind(this);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Private function
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * This is an example of a tracker callback function that can be passed to the OpenAICostTracker to track 
	 * costs in a custom way (e.g. save to a database, send to an analytics service, etc)
	 * 
	 * @param bucketId - an identifier for the tracker, used to group usage information
	 * @param response - the response from the OpenAI API, which contains the usage information in the body
	 */
	private async _trackerCallback(bucketId: string, response: Response) {
		// robust parsing - to get modelName and usage information from the response, with error handling
		const responseBody = await response.json().catch(() => null);
		const modelName = responseBody?.model;
		const usage: OpenAI.Responses.ResponseUsage | undefined = responseBody?.usage;
		// if there is no modelName or usage information in the response, we can't track the cost, so we log a warning and return
		if (usage === undefined || modelName === undefined) {
			console.warn(`Could not extract usage information from response for trackerId ${bucketId}`);
			return;
		}

		// calculate the cost based on the usage information and the model used, with error handling
		let costResponse: OpenAiCostResponse
		try {
			costResponse = await OpenAiCostCalculator.calculateCost(modelName, usage);
		} catch (error) {
			console.error(`Error calculating cost for trackerId ${bucketId}:`, error);
			return;
		}

		// Detect if the response was from openai-cache. Thus we dont track the cost for cached responses, but only for live API calls. This is 
		// to avoid tracking costs multiple times for the same response when it is cached. 
		// @ts-ignore - we know this header is added by the OpenAICache when markResponseEnabled is true, but it is not in 
		// the type definition of Response, so we ignore the type error here
		const isFromCache = response.headers.get(OpenAICache.MARK_RESPONSE_NAME) === "true";

		// get the correct bucket in the db to update based on whether the response was from cache or not
		const bucketDb = isFromCache ? this._sampleStorage.saved : this._sampleStorage.spent;

		// initialize the tracker in the db if it doesn't exist
		if (bucketDb[bucketId] === undefined) {
			bucketDb[bucketId] = { totalCost: 0 };
		}

		// update the Tracker Item Entry
		const dbEntry = bucketDb[bucketId]
		dbEntry.totalCost += costResponse.totalCost;
	}
}


