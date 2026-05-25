// local imports
import { PricingForModel } from "./pricing-types";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Local-provider pricing (Ollama / LMStudio)
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Flat fake price applied to every model served by a local provider (Ollama, LMStudio).
 *
 * Local providers have no real per-token cost, but using $0 would make tracked rows
 * aggregate to zero and disappear from totals. $0.10 / 1M tokens is a deliberate
 * memorable constant (0.1 across input, cache and output) so usage is summable
 * without pretending to model a specific cloud rate.
 */
export const LOCAL_FLAT_PRICE_PER_1M_TOKENS = 0.1;

export function getLocalPricing(modelName: string): PricingForModel {
	return {
		modelName,
		inputPer1MTokens: LOCAL_FLAT_PRICE_PER_1M_TOKENS,
		cacheInputPer1MTokens: LOCAL_FLAT_PRICE_PER_1M_TOKENS,
		outputPer1MTokens: LOCAL_FLAT_PRICE_PER_1M_TOKENS,
	};
}
