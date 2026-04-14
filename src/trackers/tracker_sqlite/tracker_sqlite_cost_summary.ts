// npm imports
import Chalk from "chalk";
import { minimatch } from "minimatch";

// local imports
import {
	OpenAiCostTrackerSqliteEntry,
	OpenAiCostTrackerSqliteBucketCost,
	OpenAiCostTrackerSqliteCostSummary,
	OpenAiCostTrackerSqliteModelCost
} from "./tracker_sqlite_type";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenAiSqliteCostSummaryHelper Class
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Helper class for summarizing and printing OpenAI API cost data.
 */
export class OpenAiSqliteCostSummaryHelper {

	/**
	 * Combine two bucket cost summaries into one, summing their costs and combining their models. The combined bucket will have the 
	 * provided combinedBucketId as its bucketId.
	 * 
	 * @param combinedBucketId The ID to assign to the combined bucket.
	 * @param summaryBucketA The first bucket to combine.
	 * @param summaryBucketB The second bucket to combine.
	 * @returns The combined bucket cost summary.
	 */
	static async costSummaryCombineBucket(
		combinedBucketId: string,
		summaryBucketA: OpenAiCostTrackerSqliteBucketCost,
		summaryBucketB: OpenAiCostTrackerSqliteBucketCost
	): Promise<OpenAiCostTrackerSqliteBucketCost> {
		// combine models from both buckets
		const combinedModelsMap: Record<string, OpenAiCostTrackerSqliteModelCost> = {};
		for (const model of [...summaryBucketA.models, ...summaryBucketB.models]) {
			if (!combinedModelsMap[model.modelName]) {
				combinedModelsMap[model.modelName] = { modelName: model.modelName, costSpent: 0, costSaved: 0 };
			}
			combinedModelsMap[model.modelName].costSpent += model.costSpent;
			combinedModelsMap[model.modelName].costSaved += model.costSaved;
		}

		const combinedModels = Object.values(combinedModelsMap);
		const combinedCostSpent = combinedModels.reduce((sum, model) => sum + model.costSpent, 0);
		const combinedCostSaved = combinedModels.reduce((sum, model) => sum + model.costSaved, 0);

		const combinedBucket: OpenAiCostTrackerSqliteBucketCost = {
			bucketId: combinedBucketId,
			costSpent: combinedCostSpent,
			costSaved: combinedCostSaved,
			models: combinedModels
		};
		return combinedBucket;
	}

	/**
	 * Group buckets that match the same pattern together to simplify the output and make it easier to read. 
	 * 
	 * @param summary The original cost summary to group.
	 * @param bucketIdGlobs An array of minimatch patterns to group buckets by. Buckets that match the same pattern will be combined together.
	 * @returns A new cost summary with buckets grouped according to the provided patterns.
	 */
	static async costSummaryGroup(
		summary: OpenAiCostTrackerSqliteCostSummary,
		bucketIdGlobs: string[],
	): Promise<OpenAiCostTrackerSqliteCostSummary> {
		const groupedSummary: OpenAiCostTrackerSqliteCostSummary = {
			total: {
				costSpent: 0,
				costSaved: 0,
			},
			buckets: [],
		};

		for (const bucketIdPattern of bucketIdGlobs) {
			// find all buckets that match the pattern
			const matchingBuckets: OpenAiCostTrackerSqliteBucketCost[] = [];
			for (const bucket of summary.buckets) {
				if (minimatch(bucket.bucketId, bucketIdPattern)) {
					matchingBuckets.push(bucket);
				}
			}

			// if no buckets match the pattern, skip it
			if (matchingBuckets.length === 0) continue;

			// combine all matching buckets into a single bucket with the pattern as the bucketId
			let combinedBucket: OpenAiCostTrackerSqliteBucketCost = {
				bucketId: bucketIdPattern,
				costSpent: 0,
				costSaved: 0,
				models: [],
			}
			for (const matchingBucket of matchingBuckets) {
				combinedBucket = await OpenAiSqliteCostSummaryHelper.costSummaryCombineBucket(bucketIdPattern, combinedBucket, matchingBucket);
			}

			// add the combined bucket to the grouped summary
			groupedSummary.buckets.push(combinedBucket);
		}

		// add any buckets that did not match any pattern without modification
		for (const bucket of summary.buckets) {
			const matchesPattern = bucketIdGlobs.some(pattern => minimatch(bucket.bucketId, pattern));
			if (!matchesPattern) {
				groupedSummary.buckets.push(bucket);
			}
		}

		// calculate total costs for the grouped summary
		groupedSummary.total.costSpent = groupedSummary.buckets.reduce((sum, bucket) => sum + bucket.costSpent, 0);
		groupedSummary.total.costSaved = groupedSummary.buckets.reduce((sum, bucket) => sum + bucket.costSaved, 0);

		return groupedSummary;
	}

	/**
	 * Sort cost summary by total cost spent in descending order, and within each bucket, sort models by cost spent in descending order
	 * This allows the most expensive buckets and models to be printed first, which can be helpful for quickly identifying where the 
	 * most costs are coming from.
	 * 
	 * @param originalSummary The original cost summary to sort.
	 * @returns A new cost summary with buckets and models sorted by cost spent in descending order.
	 */
	static async costSummarySort(originalSummary: OpenAiCostTrackerSqliteCostSummary): Promise<OpenAiCostTrackerSqliteCostSummary> {
		// sort buckets by total cost spent in descending order
		const sortedSummary = JSON.parse(JSON.stringify(originalSummary)) as OpenAiCostTrackerSqliteCostSummary;

		// sort buckets by total cost spent in descending order
		sortedSummary.buckets.sort((a, b) => b.costSpent - a.costSpent);

		// within each bucket, sort models by cost spent in descending order
		for (const bucket of sortedSummary.buckets) {
			bucket.models.sort((a, b) => b.costSpent - a.costSpent);
		}

		return sortedSummary;
	}

	/**
	 * Print cost summary in a formatted, colorized output
	 */
	static async costSummaryPrint(originalSummary: OpenAiCostTrackerSqliteCostSummary, {
		colorize = true
	}: {
		colorize?: boolean
	} = {}): Promise<string> {
		const outputLines: string[] = [];
		if (originalSummary.buckets.length === 0) {
			outputLines.push("No tracked costs found");
			return outputLines.join("\n");
		}
		const costSpentStr = (Math.ceil(originalSummary.total.costSpent * 1e6) / 1e6).toFixed(6);
		const costSavedStr = (Math.ceil(originalSummary.total.costSaved * 1e6) / 1e6).toFixed(6);

		const totalSpentStr = colorize ? Chalk.red(`$${costSpentStr}`) : `$${costSpentStr}`;
		const totalSavedStr = colorize ? Chalk.green(`$${costSavedStr}`) : `$${costSavedStr}`;

		outputLines.push(`Overall Total - Cost Spent: ${totalSpentStr}, Cost Saved: ${totalSavedStr}`);

		for (const bucket of originalSummary.buckets) {
			const bucketIdStr = colorize ? Chalk.blue(bucket.bucketId) : bucket.bucketId;
			outputLines.push(`Bucket: ${bucketIdStr}`);

			const bucketCostSpentStr = (Math.ceil(bucket.costSpent * 1e6) / 1e6).toFixed(6);
			const bucketCostSavedStr = (Math.ceil(bucket.costSaved * 1e6) / 1e6).toFixed(6);
			const bucketSpentStr = colorize ? Chalk.red(`$${bucketCostSpentStr}`) : `$${bucketCostSpentStr}`;
			const bucketSavedStr = colorize ? Chalk.green(`$${bucketCostSavedStr}`) : `$${bucketCostSavedStr}`;
			outputLines.push(`   Total - Cost Spent: ${bucketSpentStr}, Cost Saved: ${bucketSavedStr}`);

			for (const model of bucket.models) {
				const modelStr = colorize ? Chalk.blue(model.modelName) : model.modelName;

				const modelCostSpentStr = (Math.ceil(model.costSpent * 1e6) / 1e6).toFixed(6);
				const modelCostSavedStr = (Math.ceil(model.costSaved * 1e6) / 1e6).toFixed(6);
				const modelSpentStr = colorize ? Chalk.red(`$${modelCostSpentStr}`) : `$${modelCostSpentStr}`;
				const modelSavedStr = colorize ? Chalk.green(`$${modelCostSavedStr}`) : `$${modelCostSavedStr}`;

				outputLines.push(
					`   Model: ${modelStr} - Cost Spent: ${modelSpentStr}, Cost Saved: ${modelSavedStr}`
				);
			}
		}
		const outputStr = outputLines.join("\n");
		return outputStr
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


