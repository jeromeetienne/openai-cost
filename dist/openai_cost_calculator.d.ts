import OpenAI from "openai";
/** Pricing information for a single model */
export type PricingForModel = {
    modelName: string;
    /** Cost per 1M input tokens in USD */
    inputPer1MTokens: number;
    /** Cost per 1M cached input tokens in USD
     * - may be undefined if the model does not support caching or if the pricing information is not available
    */
    cacheInputPer1MTokens?: number;
    /** Cost per 1M output tokens in USD */
    outputPer1MTokens: number;
};
/** Pricing information for multiple models */
export type PricingPerModel = {
    [modelName: string]: PricingForModel;
};
/**
 * Cost response for an OpenAI API call, including input cost, cached input cost, output cost, and total cost in USD.
 */
export type OpenAiCostResponse = {
    /** Cost in USD for input tokens */
    inputCost: number;
    /** Cost in USD for cached input tokens */
    cacheInputCost: number;
    /** Cost in USD for output tokens (including reasoning tokens) */
    outputCost: number;
    /** Total cost in USD */
    totalCost: number;
};
export type PriorityType = 'batch' | 'flex' | 'standard' | 'priority';
export declare const pricingPerModel: PricingPerModel;
export declare class OpenAiCostCalculator {
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
     * const costResponse = await OpenAiCostCalculator.calculateCost(response.model, response.usage);
     * console.log(costResponse);
     * ```
     */
    static calculateCost(modelName: string, openaiUsage: OpenAI.Responses.ResponseUsage, priorityType?: PriorityType): Promise<OpenAiCostResponse>;
}
