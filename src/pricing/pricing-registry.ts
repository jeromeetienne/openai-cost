// local imports
import { ProviderId } from "../provider-detector";
import { PricingForModel } from "./pricing-types";
import { pricingOpenAiLlm, pricingOpenAiEmbedding } from "./pricing-openai";
import { pricingGeminiLlm, pricingGeminiEmbedding } from "./pricing-gemini";
import { getLocalPricing } from "./pricing-local";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PricingRegistry
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export class PricingRegistry {
	/**
	 * Resolve LLM pricing for a (provider, modelName) pair.
	 *
	 * - OpenAI / Gemini: exact lookup in the provider table; throws if the model is unknown.
	 * - Ollama / LMStudio: returns the local flat-rate pricing regardless of model name,
	 *   since local servers can serve arbitrary models with no real cost.
	 */
	static getLlmPricing(provider: ProviderId, modelName: string): PricingForModel {
		if (provider === 'ollama' || provider === 'lmstudio') {
			return getLocalPricing(modelName);
		}

		const table = provider === 'gemini' ? pricingGeminiLlm : pricingOpenAiLlm;
		const pricing = table[modelName];
		if (pricing === undefined) {
			throw new Error(`No pricing information found for model ${modelName} (provider=${provider})`);
		}
		return pricing;
	}

	/**
	 * Resolve embedding pricing for a (provider, modelName) pair.
	 * Same lookup behavior as `getLlmPricing`.
	 */
	static getEmbeddingPricing(provider: ProviderId, modelName: string): PricingForModel {
		if (provider === 'ollama' || provider === 'lmstudio') {
			return getLocalPricing(modelName);
		}

		const table = provider === 'gemini' ? pricingGeminiEmbedding : pricingOpenAiEmbedding;
		const pricing = table[modelName];
		if (pricing === undefined) {
			throw new Error(`No pricing information found for embedding model ${modelName} (provider=${provider})`);
		}
		return pricing;
	}
}
