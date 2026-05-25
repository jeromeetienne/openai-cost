// NPM imports
import OpenAI from "openai";
import { CreateEmbeddingResponse } from "openai/resources";

// local imports
import { ProviderId } from "./provider-detector";
import { PricingRegistry } from "./pricing/pricing-registry";
import { GEMINI_CONTEXT_TIER_THRESHOLD, GEMINI_TIERED_MODELS } from "./pricing/pricing-gemini";

// re-exports kept for backward compatibility with the previous single-file layout
export type { PricingForModel, PricingPerModel } from "./pricing/pricing-types";
export { pricingOpenAiLlm as pricingPerModelLlm, pricingOpenAiEmbedding as pricingPerModelEmbedding } from "./pricing/pricing-openai";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	type
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

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
//	OpenAiCostCalculator
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export class OpenAiCostCalculator {
	/**
	 * Calculate the USD cost of one LLM call from its token usage.
	 *
	 * - see https://developers.openai.com/api/docs/pricing
	 *
	 * # Usage
	 * ```ts
	 * const response = await openaiClient.responses.create({
	 *		model: 'gpt-5-mini',
	 *		input: 'hello',
	 * });
	 *
	 * const costResponse = await OpenAiCostCalculator.calculateLlmCost(response.model, response.usage);
	 * console.log(costResponse);
	 * ```
	 */
	static async calculateLlmCost(
		modelName: string,
		openaiUsage: OpenAI.Responses.ResponseUsage,
		priorityType: PriorityType = 'standard',
		provider: ProviderId = 'openai',
	): Promise<OpenAiCostResponse> {

		// Normalize the model name for context-tier-priced models (OpenAI gpt-5.4 / gpt-5.4-pro at 272K,
		// Gemini gemini-2.5-pro / gemini-3.1-pro-preview at 200K). The tier is picked from the total input token count.
		const totalInputTokens = openaiUsage.input_tokens + (openaiUsage.input_tokens_details?.cached_tokens || 0);
		modelName = OpenAiCostCalculator._applyContextTierSuffix(provider, modelName, totalInputTokens);

		// Remove date suffix from modelName if present, to match pricing keys.
		// e.g. `gpt-4o-2024-08-06` -> `gpt-4o`. Only applied to OpenAI models; Gemini uses different naming.
		if (provider === 'openai') {
			modelName = modelName.replace(/-\d{4}-\d{2}-\d{2}$/, '');
		}

		// Resolve pricing for the (provider, modelName) pair.
		// For ollama/lmstudio this always returns the flat local rate; for openai/gemini it throws on unknown models.
		const basePricing = PricingRegistry.getLlmPricing(provider, modelName);

		// Apply the priority multiplier (batch/flex 0.5x, standard 1.0x, priority 2x).
		// Working on a copy avoids the mutation drift bug the old implementation had on the shared pricing object.
		const priorityMultiplier = OpenAiCostCalculator._priorityMultiplier(priorityType);
		const inputRate = basePricing.inputPer1MTokens * priorityMultiplier;
		const cacheRate = basePricing.cacheInputPer1MTokens !== undefined
			? basePricing.cacheInputPer1MTokens * priorityMultiplier
			: undefined;
		const outputRate = basePricing.outputPer1MTokens * priorityMultiplier;

		// NOTE: `.cached_tokens` are NOT included in `.input_tokens`; both are billed.
		// Reasoning tokens are included in `.output_tokens` and billed as output tokens.
		const inputCost = (openaiUsage.input_tokens / 1_000_000) * inputRate;
		let cacheInputCost = 0;
		if (cacheRate !== undefined && openaiUsage.input_tokens_details?.cached_tokens !== undefined) {
			cacheInputCost = (openaiUsage.input_tokens_details.cached_tokens / 1_000_000) * cacheRate;
		}
		const outputCost = (openaiUsage.output_tokens / 1_000_000) * outputRate;
		const totalCost = inputCost + cacheInputCost + outputCost;

		return { inputCost, cacheInputCost, outputCost, totalCost };
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Embedding
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * - https://developers.openai.com/api/docs/guides/embeddings
	 * - https://developers.openai.com/api/docs/pricing#specialized-models
	 */
	static async calculateEmbeddingCost(
		modelName: string,
		embeddingUsage: CreateEmbeddingResponse.Usage,
		provider: ProviderId = 'openai',
	): Promise<OpenAiCostResponse> {
		const pricingForModel = PricingRegistry.getEmbeddingPricing(provider, modelName);

		const inputCost = (embeddingUsage.prompt_tokens / 1_000_000) * pricingForModel.inputPer1MTokens;
		const cacheInputCost = 0;
		const outputCost = 0;
		const totalCost = inputCost + cacheInputCost + outputCost;

		return { inputCost, cacheInputCost, outputCost, totalCost };
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	private helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	private static _applyContextTierSuffix(provider: ProviderId, modelName: string, totalInputTokens: number): string {
		if (provider === 'openai') {
			const openaiTiered = (modelName === 'gpt-5.4' || modelName === 'gpt-5.4-pro');
			if (openaiTiered === false) return modelName;
			const overThreshold = totalInputTokens > 272_000;
			return overThreshold
				? `${modelName} (>272K context length)`
				: `${modelName} (<272K context length)`;
		}

		if (provider === 'gemini') {
			if (GEMINI_TIERED_MODELS.has(modelName) === false) return modelName;
			const overThreshold = totalInputTokens > GEMINI_CONTEXT_TIER_THRESHOLD;
			return overThreshold
				? `${modelName} (>200K context length)`
				: `${modelName} (<200K context length)`;
		}

		return modelName;
	}

	private static _priorityMultiplier(priorityType: PriorityType): number {
		if (priorityType === 'batch') return 0.5;
		if (priorityType === 'flex') return 0.5;
		if (priorityType === 'priority') return 2;
		return 1.0;
	}
}
