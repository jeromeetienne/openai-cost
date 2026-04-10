// npm imports
import OpenAI from "openai";
import OpenAICache from "openai-cache";
import Chalk from "chalk";
import BetterSqlite3 from "better-sqlite3";
import { OpenAiCostCalculator, OpenAiCostResponse } from "../../openai_cost_calculator";
import {  OpenAICallTrackerCallback } from "../../openai_call_tracker";

// local imports

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	typescript types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export type OpenAiCostTrackerSqliteEntry = {
	dateIso: string;
	bucketId: string;
	modelName: string;
	costSpent: number;
	costSaved: number;
}

export type OpenAiCostTrackerSqliteModelCost = {
	modelName: string;
	costSpent: number;
	costSaved: number;
}

export type OpenAiCostTrackerSqliteBucketCost = {
	bucketId: string;
	costSpent: number;
	costSaved: number;
	models: OpenAiCostTrackerSqliteModelCost[];
}

export type OpenAiCostTrackerSqliteCostSummary = {
	total: {
		costSpent: number;
		costSaved: number;
	};
	buckets: OpenAiCostTrackerSqliteBucketCost[];
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenAiCostTrackerSqlite Class
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * SQLite-backed cost tracker for OpenAI API calls.
 * Stores costs in a SQLite database with schema: dateIso, bucketId, modelName, costSpent, costSaved
 */
export class OpenAiCostTrackerSqlite {
	private _database: BetterSqlite3.Database;
	private _dbPath: string;

	constructor(dbPath: string) {
		this._dbPath = dbPath;
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
	async getTrackerCallback(): Promise<OpenAICallTrackerCallback> {
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
	private async _trackerCallback(bucketId: string, response: Response): Promise<void> {
		// Parse response to extract model and usage info
		const responseBody = await response.json().catch(() => null);
		const modelName = responseBody?.model;
		const usage: OpenAI.Responses.ResponseUsage | undefined = responseBody?.usage;

		if (usage === undefined || modelName === undefined) {
			console.warn(`Could not extract usage information from response for trackerId ${bucketId}`);
			return;
		}

		// Calculate cost
		let costResponse: OpenAiCostResponse;
		try {
			costResponse = await OpenAiCostCalculator.calculateCost(modelName, usage);
		} catch (error) {
			console.error(`Error calculating cost for trackerId ${bucketId}:`, error);
			return;
		}

		// Check if response is from cache
		// @ts-ignore - header added by OpenAICache but not in type definition
		const isFromCache = responseBody[OpenAICache.MarkResponseName] === true;

		// Get current timestamp in full ISO 8601 format
		const dateIso = new Date().toISOString();
		const costAmount = costResponse.totalCost;

		// Append new record to database
		const insertStmt = this._database.prepare(
			"INSERT INTO cost_tracking (dateIso, bucketId, modelName, costSpent, costSaved) VALUES (?, ?, ?, ?, ?)"
		);
		const [spent, saved] = isFromCache ? [0, costAmount] : [costAmount, 0];
		insertStmt.run(dateIso, bucketId, modelName, spent, saved);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Static Methods
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Print cost summary in a formatted, colorized output
	 */
	static async printCostSummary(summary: OpenAiCostTrackerSqliteCostSummary, { colorize = true }: { colorize?: boolean } = {}): Promise<void> {
		if (summary.buckets.length === 0) {
			console.log("No tracked costs found");
			return;
		}

		const totalSpentStr = colorize
			? Chalk.red(`$${summary.total.costSpent.toFixed(6)}`)
			: `$${summary.total.costSpent.toFixed(6)}`;
		const totalSavedStr = colorize
			? Chalk.green(`$${summary.total.costSaved.toFixed(6)}`)
			: `$${summary.total.costSaved.toFixed(6)}`;

		console.log(`Overall Total - Cost Spent: ${totalSpentStr}, Cost Saved: ${totalSavedStr}`);

		for (const bucket of summary.buckets) {
			const bucketIdStr = colorize ? Chalk.blue(bucket.bucketId) : bucket.bucketId;
			console.log(`Bucket: ${bucketIdStr}`);

			const bucketSpentStr = colorize
				? Chalk.red(`$${bucket.costSpent.toFixed(6)}`)
				: `$${bucket.costSpent.toFixed(6)}`;
			const bucketSavedStr = colorize
				? Chalk.green(`$${bucket.costSaved.toFixed(6)}`)
				: `$${bucket.costSaved.toFixed(6)}`;

			console.log(`   Total - Cost Spent: ${bucketSpentStr}, Cost Saved: ${bucketSavedStr}`);

			for (const model of bucket.models) {
				const modelStr = colorize ? Chalk.blue(model.modelName) : model.modelName;
				const spentStr = colorize
					? Chalk.red(`$${model.costSpent.toFixed(6)}`)
					: `$${model.costSpent.toFixed(6)}`;
				const savedStr = colorize
					? Chalk.green(`$${model.costSaved.toFixed(6)}`)
					: `$${model.costSaved.toFixed(6)}`;

				console.log(
					`   Model: ${modelStr} - Cost Spent: ${spentStr}, Cost Saved: ${savedStr}`
				);
			}
		}
	}

	/**
	 * Convert cost tracking records to CSV format
	 */
	static recordsToCsv(records: OpenAiCostTrackerSqliteEntry[]): string {
		if (records.length === 0) {
			return "dateIso,bucketId,modelName,costSpent,costSaved\n";
		}

		const header = "dateIso,bucketId,modelName,costSpent,costSaved";
		const rows = records.map(record => {
			return `${record.dateIso},${record.bucketId},${record.modelName},${record.costSpent},${record.costSaved}`;
		});

		return [header, ...rows].join("\n");
	}
}


