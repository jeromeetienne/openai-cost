#!/usr/bin/env node

// npm imports
import * as Commander from "commander";
import Chalk from "chalk";
import * as Fs from "node:fs";
import * as Path from "node:path";
import Assert from "node:assert";

// npm imports
import stripAnsi from 'strip-ansi';

// local imports
import { OpenAiCostTrackerSqlite } from "../tracker_sqlite";
import { OpenAiSqliteCostSummaryHelper } from "../tracker_sqlite_cost_summary";
import { OpenAiSqliteBucketPatternHelper } from "../tracker_sqlite_bucket_pattern";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	MainHelper Class
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

class MainHelper {
	static async doPrettyPrint(inputPath: string, {
		maxPrintLines: maxPrintRows,
		maxPrintColumns,
		patternDefinition,
		patternVariables,
	}: {
		maxPrintLines?: number;
		maxPrintColumns?: number;
		patternDefinition?: string;
		patternVariables?: string[];
	}): Promise<string> {
		// init the tracker
		const tracker = new OpenAiCostTrackerSqlite(inputPath);
		await tracker.init();

		// get the cost summary
		let costSummary = await tracker.getSummaryCosts();

		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////
		//	
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////

		let bucketIdGlobs: string[] | null = null;
		if (patternDefinition && patternVariables) {
			const compiledPattern = OpenAiSqliteBucketPatternHelper.compilePatternDef(patternDefinition);
			const bucketIds = costSummary.buckets.map(bucket => bucket.bucketId);
			bucketIdGlobs = OpenAiSqliteBucketPatternHelper.toGlobs(bucketIds, compiledPattern, patternVariables);
		}

		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////
		//	
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////

		// if bucketIdPatterns are provided, we want to group buckets that match the same pattern together to simplify 
		// the output and make it easier to read. For example, if we have bucketIds that include timestamps 
		// like "bucket_2023-01-01" and "bucket_2023-01-02", we may want to group them together under a 
		// common bucketId pattern like "bucket_*" to see the total costs for all buckets that match that pattern.
		if (bucketIdGlobs !== null) {
			costSummary = await OpenAiSqliteCostSummaryHelper.costSummaryGroup(costSummary, bucketIdGlobs);
		}

		// sort the cost summary to ensure the most expensive buckets are printed first
		costSummary = await OpenAiSqliteCostSummaryHelper.costSummarySort(costSummary);

		// get the output string
		let outputStr = await OpenAiSqliteCostSummaryHelper.costSummaryPrint(costSummary);

		// limit the number of lines to avoid overwhelming the console if there are many buckets/models
		if (maxPrintRows !== undefined) {
			let lines = outputStr.split("\n");
			lines = lines.slice(0, maxPrintRows);
			outputStr = lines.join("\n");
		}
		if (maxPrintColumns !== undefined) {
			const lines = outputStr.split("\n");
			const truncatedLines = lines.map(line => {
				if (stripAnsi(line).length > maxPrintColumns) {
					return stripAnsi(line).slice(0, maxPrintColumns - 3) + "...";
				} else {
					return line;
				}
			});
			outputStr = truncatedLines.join("\n");
		}

		// close the tracker to release the database file
		await tracker.close();

		return outputStr;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	.doWatch()
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	static async doWatch(inputPath: string, {
		periodMs = 500,
		patternDefinition,
		patternVariables,
	}: {
		periodMs?: number;
		patternDefinition?: string;
		patternVariables?: string[];
	} = {}) {
		let signalReceived = false;
		process.on('SIGINT', async () => {
			if (signalReceived) return; // if we receive multiple signals, we want to avoid calling close multiple times
			signalReceived = true;
			console.log(Chalk.yellow("\nSIGINT received. Exiting..."));
		});
		console.log(Chalk.yellow("Watching for cost updates... (press Ctrl+C to exit)"));
		while (signalReceived === false) {
			const outputStr = await MainHelper.doPrettyPrint(inputPath, {
				maxPrintLines: process.stdout.rows - 1,	// -1 to account for the "Watching for cost updates..." line
				maxPrintColumns: process.stdout.columns,
				patternDefinition,
				patternVariables
			});
			console.clear();
			console.log(Chalk.yellow(`Watching for cost updates... ${new Date().toLocaleString()} (press Ctrl+C to exit)`));
			process.stdout.write(outputStr);
			await new Promise(resolve => setTimeout(resolve, periodMs));
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	.doExportCsv()
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	static async doExportCsv(inputPath: string, outputCsv: string) {
		const tracker = new OpenAiCostTrackerSqlite(inputPath);
		await tracker.init();
		const allRecords = await tracker.getAllRecords();
		const csvContent = OpenAiSqliteCostSummaryHelper.recordsToCsv(allRecords);

		// Create parent directory if needed
		const dir = Path.dirname(outputCsv);
		if (dir && dir !== ".") {
			Fs.mkdirSync(dir, { recursive: true });
		}

		Fs.writeFileSync(outputCsv, csvContent);
		console.log(Chalk.green(`CSV file exported to: ${outputCsv}`));

		// close the tracker to release the database file
		await tracker.close();
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

async function main() {
	// parse command line arguments
	const program = new Commander.Command();
	program
		.requiredOption('-i, --input_path <path>', 'path to the database file')
		.option('-w, --watch', 'periodically print cost summary to console')
		.option('-o, --output_csv <path>', 'optional path to output CSV file')
		.option('-p, --patternDefinition <pattern>', 'optional bucket ID pattern definition to group buckets in the output (e.g. "{namespace}/{userId}/{skilletId}/{sessionId}")')
		.option('-k, --patternVariableList <variables>', 'optional comma-separated list of variable names corresponding to the pattern definition (e.g. "userId,skilletId")')
	program.parse(process.argv);
	const options = program.opts<{
		input_path: string;
		watch?: boolean;
		output_csv?: string;
		patternDefinition?: string;
		patternVariableList?: string;
	}>();

	// Parse comma-separated patternVariableList string into array
	let patternVariables: string[] | undefined = undefined;
	if (options.patternVariableList !== undefined) {
		patternVariables = options.patternVariableList.split(',').map(v => v.trim());
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	init the sample db to store tracked costs from the OpenAICallTracker
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////


	// Print summary if requested
	if (options.watch !== true && options.output_csv === undefined) {
		await MainHelper.doPrettyPrint(options.input_path, {
			patternDefinition: options.patternDefinition,
			patternVariables: patternVariables,
		});
	} else if (options.watch === true) {
		await MainHelper.doWatch(options.input_path, {
			patternDefinition: options.patternDefinition,
			patternVariables: patternVariables,
		});
	} else if (options.output_csv) {	// Export to CSV if requested
		await MainHelper.doExportCsv(options.input_path, options.output_csv);
	} else {
		Assert.ok(false, "This point should not be reachable due to the earlier conditionals. Please report this as a bug.");
	}
}

main().catch((error) => {
	console.error("Error in main:", error);
	process.exit(1);
})