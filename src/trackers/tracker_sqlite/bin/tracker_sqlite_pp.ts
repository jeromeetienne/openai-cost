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

	const tracker = new OpenAiCostTrackerSqlite(options.input_path);
	await tracker.init();
	console.log(Chalk.yellow(`database opened from file: ${options.input_path}`));

	// Print summary if requested
	if (options.watch !== true && options.output_csv === undefined) {
		const costSummary = await tracker.getSummaryCosts();
		await OpenAiCostTrackerSqlite.printCostSummary(costSummary);
	}else if (options.watch === true) {
		console.log(Chalk.yellow("Watching for cost updates... (press Ctrl+C to exit)"));
		const printCostSummary = async () => {
			const costSummary = await tracker.getSummaryCosts();
			await OpenAiCostTrackerSqlite.printCostSummary(costSummary);
		};
		let signalReceived = false;
		process.on('SIGINT', async () => {
			signalReceived = true;
			console.log(Chalk.yellow("\nSIGINT received. Closing database..."));
			await tracker.close();
		});
		while(signalReceived === false) {
			console.clear();
			await printCostSummary();
			await new Promise(resolve => setTimeout(resolve, 500));
		}
	}else if (options.output_csv) {	// Export to CSV if requested
		const allRecords = await tracker.getAllRecords();
		const csvContent = OpenAiCostTrackerSqlite.recordsToCsv(allRecords);

		// Create parent directory if needed
		const dir = Path.dirname(options.output_csv);
		if (dir && dir !== ".") {
			Fs.mkdirSync(dir, { recursive: true });
		}

		Fs.writeFileSync(options.output_csv, csvContent);
		console.log(Chalk.green(`CSV file exported to: ${options.output_csv}`));
	}else {
		Assert.ok(false, "This point should not be reachable due to the earlier conditionals. Please report this as a bug.");
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	
	await tracker.close();
}

main().catch((error) => {
	console.error("Error in main:", error);
	process.exit(1);
})