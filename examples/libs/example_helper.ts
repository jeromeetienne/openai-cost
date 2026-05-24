// npm imports
import OpenAI from "openai";
import Chalk from "chalk";

// npm imports
import { CreateEmbeddingResponse } from "openai/resources";

// local imports
import { OpenAiCostCalculator, OpenAiCostResponse } from "../../src/openai_cost_calculator";


///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export class ExampleHelper {
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	function doCallNoStream() - makes a non-streamed API call
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	static async doCallNoStream(openaiClient: OpenAI): Promise<{
		openaiResponseUsage: OpenAI.Responses.ResponseUsage,
		costResponse: OpenAiCostResponse,
		callElapsed: number
	}> {
		const prompt = `hello world`
		const modelName = 'gpt-4.1-nano';

		// measure call start time
		const callStart = Date.now();

		console.log(`making first API call...`);
		const response1 = await openaiClient.responses.create({
			model: modelName,
			input: prompt,
		});

		// calculate the cost of the API call using the OpenAiCostCalculator
		const openaiResponseUsage: OpenAI.Responses.ResponseUsage = response1.usage!
		const costResponse = await OpenAiCostCalculator.calculateLlmCost(modelName, openaiResponseUsage);
		// measure call elapsed time
		const callElapsed = Date.now() - callStart;

		// display info about the call
		console.log(`openai usage:`, JSON.stringify(openaiResponseUsage));
		console.log(`cost response (cache untracked):`, JSON.stringify(costResponse));
		console.log(`cost for this response (cache untracked): $${costResponse.totalCost.toFixed(6)} - ${(1 / costResponse.totalCost).toFixed(2)} call/usd`);
		console.log(`duration: ${Chalk.cyan(callElapsed)} ms`);

		// return the usage, cost response and elapsed time for this call
		return { openaiResponseUsage, costResponse, callElapsed }
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	function doCallStreamed() - makes a streamed API call
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	static async doCallStreamed(openaiClient: OpenAI): Promise<{
		openaiResponseUsage: OpenAI.Responses.ResponseUsage,
		costResponse: OpenAiCostResponse,
		callElapsed: number
	}> {
		const prompt = `hello world`
		const modelName = 'gpt-4.1-nano';

		// measure call start time
		const callStart = Date.now();

		// Make a streamed API call - with streaming, to get the response usage and calculate the cost of the API call using the OpenAiCostCalculator
		const responseStreamEvents = await openaiClient.responses.create({
			model: modelName,
			input: prompt,
			stream: true,
		});

		// Get ResponseUsage from the response
		// Note: with streamed responses, the usage is only available in the final event of the stream, which is the ResponseCompletedEvent
		// so we will consume the stream events until we get to the final event, and then get the usage from there

		// consume all the events from the response stream, which will trigger the cost tracking in the OpenAICallTracker
		let responseStreamEvent: OpenAI.Responses.ResponseStreamEvent
		for await (responseStreamEvent of responseStreamEvents) {
			// console.log(`- streamed event type: ${responseStreamEvent.type} - ${JSON.stringify(responseStreamEvent)}`);
			process.stdout.write(`.`);
		}
		process.stdout.write(`\n`);

		// Get ResponseUsage from the final response event
		const responseCompletedEvent = responseStreamEvent! as OpenAI.Responses.ResponseCompletedEvent;
		const openaiResponseUsage: OpenAI.Responses.ResponseUsage = responseCompletedEvent.response.usage!

		// calculate the cost of the API call using the OpenAiCostCalculator
		const costResponse = await OpenAiCostCalculator.calculateLlmCost(modelName, openaiResponseUsage);
		// measure call elapsed time
		const callElapsed = Date.now() - callStart;

		// display info about the call
		console.log(`openai usage:`, JSON.stringify(openaiResponseUsage));
		console.log(`cost response (cache untracked):`, JSON.stringify(costResponse));
		console.log(`cost for this response (cache untracked): $${costResponse.totalCost.toFixed(6)} - ${(1 / costResponse.totalCost).toFixed(2)} call/usd`);
		console.log(`duration: ${Chalk.cyan(callElapsed)} ms`);

		// return the usage, cost response and elapsed time for this call
		return { openaiResponseUsage, costResponse, callElapsed }
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	function doCallEmbedding() - makes an embedding API call
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	static async doCallEmbedding(openaiClient: OpenAI): Promise<{
		openaiEmbeddingUsage: CreateEmbeddingResponse.Usage,
		costResponse: OpenAiCostResponse,
		callElapsed: number
	}> {
		const input = `Hello world.`
		const modelName = 'text-embedding-3-small';

		// measure call start time
		const callStart = Date.now();

		// Make an embedding API call
		const response = await openaiClient.embeddings.create({
			model: modelName,
			input: input,
		});

		// Get ResponseUsage from the response
		const openaiEmbeddingUsage: CreateEmbeddingResponse.Usage = response.usage!

		// calculate the cost of the API call using the OpenAiCostCalculator
		const costResponse = await OpenAiCostCalculator.calculateEmbeddingCost(modelName, openaiEmbeddingUsage);
		console.log(`openai usage:`, JSON.stringify(openaiEmbeddingUsage));
		console.log(`cost response:`, JSON.stringify(costResponse));

		// display the cost of the API call
		console.log(`cost for this response: $${costResponse.totalCost.toFixed(6)} - ${(1 / costResponse.totalCost).toFixed(2)} call/usd`);

		// measure call elapsed time
		const callElapsed = Date.now() - callStart;
		console.log(`duration: ${Chalk.cyan(callElapsed)} ms`);

		// return the usage, cost response and elapsed time for this call
		return { openaiEmbeddingUsage, costResponse, callElapsed }
	}
}