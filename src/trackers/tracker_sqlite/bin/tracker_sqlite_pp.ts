// npm imports
import * as Commander from "commander";
import Chalk from "chalk";
import * as Fs from "node:fs";
import * as Path from "node:path";
import Assert from "node:assert";

// local imports
import { OpenAiCostTrackerSqlite } from "../tracker_sqlite";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

class MainHelper {
	static async doPrettyPrint(inputPath: string) {
		const tracker = new OpenAiCostTrackerSqlite(inputPath);
		await tracker.init();
		console.log(Chalk.yellow(`database opened from file: ${inputPath}`));
		const costSummary = await tracker.getSummaryCosts();
		await OpenAiCostTrackerSqlite.printCostSummary(costSummary);
		// close the tracker to release the database file
		await tracker.close();
	}

	static async doWatch(inputPath: string) {
		console.log(Chalk.yellow("Watching for cost updates... (press Ctrl+C to exit)"));
		const printCostSummary = async () => {
			const tracker = new OpenAiCostTrackerSqlite(inputPath);
			await tracker.init();
			// console.log(Chalk.yellow(`database opened from file: ${inputPath}`));
			const costSummary = await tracker.getSummaryCosts();
			await OpenAiCostTrackerSqlite.printCostSummary(costSummary);
			// close the tracker to release the database file
			await tracker.close();
		};
		let signalReceived = false;
		process.on('SIGINT', async () => {
			if (signalReceived) return; // if we receive multiple signals, we want to avoid calling close multiple times
			signalReceived = true;
			console.log(Chalk.yellow("\nSIGINT received. Exiting..."));
		});
		while (signalReceived === false) {
			console.clear();
			console.log(Chalk.yellow(`Watching for cost updates... ${new Date().toLocaleString()} (press Ctrl+C to exit)`));
			await printCostSummary();
			await new Promise(resolve => setTimeout(resolve, 500));
		}
	}

	static async doExportCsv(inputPath: string, outputCsv: string) {
		const tracker = new OpenAiCostTrackerSqlite(inputPath);
		await tracker.init();
		const allRecords = await tracker.getAllRecords();
		const csvContent = OpenAiCostTrackerSqlite.recordsToCsv(allRecords);

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
	program.parse(process.argv);
	const options = program.opts<{
		input_path: string;
		watch?: boolean;
		output_csv?: string;
	}>();

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	init the sample db to store tracked costs from the OpenAICallTracker
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////


	// Print summary if requested
	if (options.watch !== true && options.output_csv === undefined) {
		await MainHelper.doPrettyPrint(options.input_path);
	} else if (options.watch === true) {
		await MainHelper.doWatch(options.input_path);
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