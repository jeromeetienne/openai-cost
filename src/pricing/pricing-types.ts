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
