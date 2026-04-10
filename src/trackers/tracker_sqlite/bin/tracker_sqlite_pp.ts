// npm imports
import * as Commander from "commander";
import Chalk from "chalk";
import * as Fs from "node:fs";
import * as Path from "node:path";

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
		.option('-p, --print', 'print cost summary to console')
		.option('-o, --output_csv <path>', 'optional path to output CSV file')
	program.parse(process.argv);
	const options = program.opts<{
		input_path: string;
		print?: boolean;
		output_csv?: string;
	}>();

	// Validate that at least one output option is specified
	if (options.print === undefined && options.output_csv === undefined) {
		console.error(Chalk.red('Error: Please specify either -p/--print or -o/--output-csv'));
		process.exit(1);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	init the sample db to store tracked costs from the OpenAICallTracker
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	const tracker = new OpenAiCostTrackerSqlite(options.input_path);
	await tracker.init();
	console.log(Chalk.yellow(`database opened from file: ${options.input_path}`));

	// Print summary if requested
	if (options.print) {
		const costSummary = await tracker.getSummaryCosts();
		await OpenAiCostTrackerSqlite.printCostSummary(costSummary);
	}

	// Export to CSV if requested
	if (options.output_csv) {
		const allRecords = await tracker.getAllRecords();
		const csvContent = OpenAiCostTrackerSqlite.recordsToCsv(allRecords);

		// Create parent directory if needed
		const dir = Path.dirname(options.output_csv);
		if (dir && dir !== ".") {
			Fs.mkdirSync(dir, { recursive: true });
		}

		Fs.writeFileSync(options.output_csv, csvContent);
		console.log(Chalk.green(`CSV file exported to: ${options.output_csv}`));
	}

	await tracker.close();
}

main().catch((error) => {
	console.error("Error in main:", error);
	process.exit(1);
})