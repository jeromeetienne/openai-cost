// NPM imports
import OpenAI from "openai";
import { CreateEmbeddingResponse } from "openai/resources";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	type
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** Pricing information for a single model */
export type PricingForModel = {
	modelName: string,
	/** Cost per 1M input tokens in USD */
	inputPer1MTokens: number,
	/** Cost per 1M cached input tokens in USD 
	 * - may be undefined if the model does not support caching or if the pricing information is not available
	*/
	cacheInputPer1MTokens?: number,
	/** Cost per 1M output tokens in USD */
	outputPer1MTokens: number,

}

/** Pricing information for multiple models */
export type PricingPerModel = {
	[modelName: string]: PricingForModel
}

/**
 * Cost response for an OpenAI API call, including input cost, cached input cost, output cost, and total cost in USD.
 */
export type OpenAiCostResponse = {
	/** Cost in USD for input tokens */
	inputCost: number,
	/** Cost in USD for cached input tokens */
	cacheInputCost: number,
	/** Cost in USD for output tokens (including reasoning tokens) */
	outputCost: number,
	/** Total cost in USD */
	totalCost: number,
}

export type PriorityType = 'batch' | 'flex' | 'standard' | 'priority';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	from https://developers.openai.com/api/docs/pricing
//
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// # Prompt
//
// from https://developers.openai.com/api/docs/pricing
// 1. take a screenshot of the pricing table
// 2. in chatgpt, include the screenshot as image and ask :
// ```
// from the reference image output a typescript object of the format:
// 
// const pricingPerModelStandard: PricingPerModel = {
// 	'gpt-5-mini': {
// 		modelName: 'gpt-5-mini',
// 		inputPer1MTokens: 0.25,
// 		cacheInputPer1MTokens: 0.025,
// 		outputPer1MTokens: 2.00,
// 	},
// }
// ```

export const pricingPerModelLlm: PricingPerModel = {
	'gpt-5.4 (<272K context length)': {
		modelName: 'gpt-5.4 (<272K context length)',
		inputPer1MTokens: 2.5,
		cacheInputPer1MTokens: 0.25,
		outputPer1MTokens: 15.0,
	},
	'gpt-5.4 (>272K context length)': {
		modelName: 'gpt-5.4 (>272K context length)',
		inputPer1MTokens: 5.0,
		cacheInputPer1MTokens: 0.5,
		outputPer1MTokens: 22.5,
	},
	'gpt-5.4-pro (<272K context length)': {
		modelName: 'gpt-5.4-pro (<272K context length)',
		inputPer1MTokens: 30.0,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 180.0,
	},
	'gpt-5.4-pro (>272K context length)': {
		modelName: 'gpt-5.4-pro (>272K context length)',
		inputPer1MTokens: 60.0,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 270.0,
	},
	'gpt-5.4-mini': {
		modelName: 'gpt-5.4-mini',
		inputPer1MTokens: 0.75,
		cacheInputPer1MTokens: 0.075,
		outputPer1MTokens: 4.5,
	},
	'gpt-5.4-nano': {
		modelName: 'gpt-5.4-nano',
		inputPer1MTokens: 0.2,
		cacheInputPer1MTokens: 0.2,
		outputPer1MTokens: 1.25,
	},
	'gpt-5.2': {
		modelName: 'gpt-5.2',
		inputPer1MTokens: 1.75,
		cacheInputPer1MTokens: 0.175,
		outputPer1MTokens: 14.0,
	},
	'gpt-5.1': {
		modelName: 'gpt-5.1',
		inputPer1MTokens: 1.25,
		cacheInputPer1MTokens: 0.125,
		outputPer1MTokens: 10.0,
	},
	'gpt-5': {
		modelName: 'gpt-5',
		inputPer1MTokens: 1.25,
		cacheInputPer1MTokens: 0.125,
		outputPer1MTokens: 10.0,
	},
	'gpt-5-mini': {
		modelName: 'gpt-5-mini',
		inputPer1MTokens: 0.25,
		cacheInputPer1MTokens: 0.025,
		outputPer1MTokens: 2.0,
	},
	'gpt-5-nano': {
		modelName: 'gpt-5-nano',
		inputPer1MTokens: 0.05,
		cacheInputPer1MTokens: 0.005,
		outputPer1MTokens: 0.4,
	},
	'gpt-5.3-chat-latest': {
		modelName: 'gpt-5.3-chat-latest',
		inputPer1MTokens: 1.75,
		cacheInputPer1MTokens: 0.175,
		outputPer1MTokens: 14.0,
	},
	'gpt-5.2-chat-latest': {
		modelName: 'gpt-5.2-chat-latest',
		inputPer1MTokens: 1.75,
		cacheInputPer1MTokens: 0.175,
		outputPer1MTokens: 14.0,
	},
	'gpt-5.1-chat-latest': {
		modelName: 'gpt-5.1-chat-latest',
		inputPer1MTokens: 1.25,
		cacheInputPer1MTokens: 0.125,
		outputPer1MTokens: 10.0,
	},
	'gpt-5-chat-latest': {
		modelName: 'gpt-5-chat-latest',
		inputPer1MTokens: 1.25,
		cacheInputPer1MTokens: 0.125,
		outputPer1MTokens: 10.0,
	},
	'gpt-5.3-codex': {
		modelName: 'gpt-5.3-codex',
		inputPer1MTokens: 1.75,
		cacheInputPer1MTokens: 0.175,
		outputPer1MTokens: 14.0,
	},
	'gpt-5.2-codex': {
		modelName: 'gpt-5.2-codex',
		inputPer1MTokens: 1.75,
		cacheInputPer1MTokens: 0.175,
		outputPer1MTokens: 14.0,
	},
	'gpt-5.1-codex-max': {
		modelName: 'gpt-5.1-codex-max',
		inputPer1MTokens: 1.25,
		cacheInputPer1MTokens: 0.125,
		outputPer1MTokens: 10.0,
	},
	'gpt-5.1-codex': {
		modelName: 'gpt-5.1-codex',
		inputPer1MTokens: 1.25,
		cacheInputPer1MTokens: 0.125,
		outputPer1MTokens: 10.0,
	},
	'gpt-5-codex': {
		modelName: 'gpt-5-codex',
		inputPer1MTokens: 1.25,
		cacheInputPer1MTokens: 0.125,
		outputPer1MTokens: 10.0,
	},
	'gpt-5.2-pro': {
		modelName: 'gpt-5.2-pro',
		inputPer1MTokens: 21.0,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 168.0,
	},
	'gpt-5-pro': {
		modelName: 'gpt-5-pro',
		inputPer1MTokens: 15.0,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 120.0,
	},
	'gpt-4.1': {
		modelName: 'gpt-4.1',
		inputPer1MTokens: 2.0,
		cacheInputPer1MTokens: 0.5,
		outputPer1MTokens: 8.0,
	},
	'gpt-4.1-mini': {
		modelName: 'gpt-4.1-mini',
		inputPer1MTokens: 0.4,
		cacheInputPer1MTokens: 0.1,
		outputPer1MTokens: 1.6,
	},
	'gpt-4.1-nano': {
		modelName: 'gpt-4.1-nano',
		inputPer1MTokens: 0.1,
		cacheInputPer1MTokens: 0.025,
		outputPer1MTokens: 0.4,
	},
	'gpt-4o': {
		modelName: 'gpt-4o',
		inputPer1MTokens: 2.5,
		cacheInputPer1MTokens: 1.25,
		outputPer1MTokens: 10.0,
	},
	'gpt-4o-2024-05-13': {
		modelName: 'gpt-4o-2024-05-13',
		inputPer1MTokens: 5.0,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 15.0,
	},
	'gpt-4o-mini': {
		modelName: 'gpt-4o-mini',
		inputPer1MTokens: 0.15,
		cacheInputPer1MTokens: 0.075,
		outputPer1MTokens: 0.6,
	},
	'gpt-realtime': {
		modelName: 'gpt-realtime',
		inputPer1MTokens: 4.0,
		cacheInputPer1MTokens: 0.4,
		outputPer1MTokens: 16.0,
	},
	'gpt-realtime-1.5': {
		modelName: 'gpt-realtime-1.5',
		inputPer1MTokens: 4.0,
		cacheInputPer1MTokens: 0.4,
		outputPer1MTokens: 16.0,
	},
	'gpt-realtime-mini': {
		modelName: 'gpt-realtime-mini',
		inputPer1MTokens: 0.6,
		cacheInputPer1MTokens: 0.06,
		outputPer1MTokens: 2.4,
	},
	'gpt-4o-realtime-preview': {
		modelName: 'gpt-4o-realtime-preview',
		inputPer1MTokens: 5.0,
		cacheInputPer1MTokens: 2.5,
		outputPer1MTokens: 20.0,
	},
	'gpt-4o-mini-realtime-preview': {
		modelName: 'gpt-4o-mini-realtime-preview',
		inputPer1MTokens: 0.6,
		cacheInputPer1MTokens: 0.3,
		outputPer1MTokens: 2.4,
	},
	'gpt-audio': {
		modelName: 'gpt-audio',
		inputPer1MTokens: 2.5,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 10.0,
	},
	'gpt-audio-1.5': {
		modelName: 'gpt-audio-1.5',
		inputPer1MTokens: 2.5,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 10.0,
	},
	'gpt-audio-mini': {
		modelName: 'gpt-audio-mini',
		inputPer1MTokens: 0.6,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 2.4,
	},
	'gpt-4o-audio-preview': {
		modelName: 'gpt-4o-audio-preview',
		inputPer1MTokens: 2.5,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 10.0,
	},
	'gpt-4o-mini-audio-preview': {
		modelName: 'gpt-4o-mini-audio-preview',
		inputPer1MTokens: 0.15,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 0.6,
	},
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Embedding model
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export const pricingPerModelEmbedding: PricingPerModel = {
	'text-embedding-3-small': {
		modelName: 'text-embedding-3-small',
		inputPer1MTokens: 0.02,
		cacheInputPer1MTokens: 0,
		outputPer1MTokens: 0,
	},
	'text-embedding-3-large': {
		modelName: 'text-embedding-3-large',
		inputPer1MTokens: 0.13,
		cacheInputPer1MTokens: 0,
		outputPer1MTokens: 0,
	},
	'text-embedding-ada-002': {
		modelName: 'text-embedding-ada-002',
		inputPer1MTokens: 0.10,
		cacheInputPer1MTokens: 0,
		outputPer1MTokens: 0,
	},
}



///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export class OpenAiCostCalculator {
	/**
	 * - see https://developers.openai.com/api/docs/pricing
	 * 
	 * # Usage
	 * ```ts
	 * const response = await openaiClient.responses.create({
	 *		model: 'gpt-5-mini',
	 *		input: 'hello',
	 * });
	 *
	 * const openaiUsage: OpenAI.Responses.ResponseUsage = response.usage!
	 * const costResponse = await OpenAiCostCalculator.calculateLlmCost(response.model, response.usage);
	 * console.log(costResponse);
	 * ```
	 */
	static async calculateLlmCost(
		modelName: string,
		openaiUsage: OpenAI.Responses.ResponseUsage,
		priorityType: PriorityType = 'standard'
	): Promise<OpenAiCostResponse> {
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////
		//	handle the `272K input tokens` case for `gpt-5.4` and `gpt-5.4-pro`
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////

		// NOTE: handle the `272K input tokens` case for `gpt-5.4` and `gpt-5.4-pro`
		// - see details at https://developers.openai.com/api/docs/pricing
		// - Modify the modelName to include ` (>272K context length)` or `(<272K context length)` based on total input tokens and modelName
		const modelIn272kCase = (modelName === 'gpt-5.4' || modelName === 'gpt-5.4-pro')
		const totalInputTokens = openaiUsage.input_tokens + (openaiUsage.input_tokens_details?.cached_tokens || 0);
		const usageIn272kCase = (totalInputTokens > 272_000);
		if (modelIn272kCase && usageIn272kCase) {
			modelName = `${modelName} (>272K context length)`;
		} else if (modelIn272kCase && usageIn272kCase === false) {
			modelName = `${modelName} (<272K context length)`;
		}

		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////
		//	Remove date suffix if needed
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////

		// Remove date suffix from modelName if present, to match the pricingPerModel keys
		// - For example, if the modelName is `gpt-4o-2024-05-13`, we remove the `-2024-05-13` suffix to get `gpt-4o`, which is the key in pricingPerModel
		const modelNameWithoutDate = modelName.replace(/-\d{4}-\d{2}-\d{2}$/, '');
		modelName = modelNameWithoutDate;


		// get pricing information for the model
		const pricingForModel = pricingPerModelLlm[modelName];
		if (pricingForModel === undefined) {
			throw new Error(`No pricing information found for model ${modelName}`);
		}

		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////
		//	Handle the priorityType for cost calculation
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////

		// Handle the priorityType for cost calculation
		// - see details at https://developers.openai.com/api/docs/pricing#priority-tiers
		// - Modify the inputPer1MTokens, cacheInputPer1MTokens, and outputPer1MTokens based on priorityType
		let priorityPricingMultiplier = 1.0;
		if (priorityType === 'batch') {
			priorityPricingMultiplier = 0.5;
		} else if (priorityType === 'flex') {
			priorityPricingMultiplier = 0.5;
		} else if (priorityType === 'standard') {
			priorityPricingMultiplier = 1.0;
		} else if (priorityType === 'priority') {
			priorityPricingMultiplier = 2;
		}
		// apply the priorityPricingMultiplier to the pricingForModel
		pricingForModel.inputPer1MTokens *= priorityPricingMultiplier;
		if (pricingForModel.cacheInputPer1MTokens !== undefined) {
			pricingForModel.cacheInputPer1MTokens *= priorityPricingMultiplier;
		}
		pricingForModel.outputPer1MTokens *= priorityPricingMultiplier;

		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////
		//	Compute the cost for the usage
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////


		// NOTE: about input .cached_tokens and cost calculation
		// - `.cached_tokens` are not included in `.input_tokens`, so both are included in the total input token count and cost calculation, 

		// NOTE: About reasoning tokens and cost calculation
		// - Reasoning tokens are not billed separately, but they are still output tokens, so they are included in the output token count and cost calculation.
		// from https://developers.openai.com/api/docs/pricing
		// "While reasoning tokens are not visible via the API, they still occupy space in the model’s context window and are billed as output tokens."

		// Compute the input cost
		const inputCost = (openaiUsage.input_tokens / 1_000_000) * pricingForModel.inputPer1MTokens;
		// Compute the cached input cost (if applicable)
		let cacheInputCost = 0;
		if (pricingForModel.cacheInputPer1MTokens !== undefined && openaiUsage.input_tokens_details?.cached_tokens !== undefined) {
			cacheInputCost = (openaiUsage.input_tokens_details.cached_tokens / 1_000_000) * pricingForModel.cacheInputPer1MTokens;
		}
		// Compute the output cost (including reasoning tokens)
		const outputCost = (openaiUsage.output_tokens / 1_000_000) * pricingForModel.outputPer1MTokens;

		// compute total cost
		const totalCost = inputCost + cacheInputCost + outputCost;

		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////
		//	build the costResponse object and return it
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////


		// build the costResponse object and return it
		const costResponse: OpenAiCostResponse = {
			inputCost,
			cacheInputCost,
			outputCost,
			totalCost,
		}
		return costResponse;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * - https://developers.openai.com/api/docs/guides/embeddings
	 * - https://developers.openai.com/api/docs/pricing#specialized-models
	 * @param modelName 
	 * @param embeddingUsage 
	 */
	static async calculateEmbeddingCost(
		modelName: string,
		embeddingUsage: CreateEmbeddingResponse.Usage,
	): Promise<OpenAiCostResponse> {
		// For embedding models, we only have input tokens and no output tokens, so we can calculate the cost using the input tokens 
		// and the pricing information for the embedding model
		const pricingForModel = pricingPerModelEmbedding[modelName];
		if (pricingForModel === undefined) {
			throw new Error(`No pricing information found for embedding model ${modelName}`);
		}

		// Compute the input cost
		const inputCost = (embeddingUsage.prompt_tokens / 1_000_000) * pricingForModel.inputPer1MTokens;

		// For embedding models, there are no output tokens and no cached input tokens, so those costs are 0
		const cacheInputCost = 0;
		const outputCost = 0;

		// compute total cost
		const totalCost = inputCost + cacheInputCost + outputCost;

		// build the costResponse object and return it
		const costResponse: OpenAiCostResponse = {
			inputCost,
			cacheInputCost,
			outputCost,
			totalCost,
		}
		return costResponse;
	}
}