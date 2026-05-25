// local imports
import { PricingPerModel } from "./pricing-types";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Gemini pricing tables
//	from https://ai.google.dev/gemini-api/docs/pricing
//
//	Gemini 2.5 Pro and 3.1 Pro Preview use tiered pricing based on prompt context length
//	(<=200K vs >200K tokens). Like OpenAI's gpt-5.4, the tier is selected at
//	calculation time by appending a context-length suffix to the model name.
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export const GEMINI_CONTEXT_TIER_THRESHOLD = 200_000;

export const pricingGeminiLlm: PricingPerModel = {
	'gemini-3.5-flash': {
		modelName: 'gemini-3.5-flash',
		inputPer1MTokens: 1.5,
		cacheInputPer1MTokens: 0.15,
		outputPer1MTokens: 9.0,
	},
	'gemini-3.1-pro-preview (<200K context length)': {
		modelName: 'gemini-3.1-pro-preview (<200K context length)',
		inputPer1MTokens: 2.0,
		cacheInputPer1MTokens: 0.2,
		outputPer1MTokens: 12.0,
	},
	'gemini-3.1-pro-preview (>200K context length)': {
		modelName: 'gemini-3.1-pro-preview (>200K context length)',
		inputPer1MTokens: 4.0,
		cacheInputPer1MTokens: 0.4,
		outputPer1MTokens: 18.0,
	},
	'gemini-3.1-flash-lite': {
		modelName: 'gemini-3.1-flash-lite',
		inputPer1MTokens: 0.25,
		cacheInputPer1MTokens: 0.025,
		outputPer1MTokens: 1.5,
	},
	'gemini-3-flash-preview': {
		modelName: 'gemini-3-flash-preview',
		inputPer1MTokens: 0.5,
		cacheInputPer1MTokens: 0.05,
		outputPer1MTokens: 3.0,
	},
	'gemini-2.5-pro (<200K context length)': {
		modelName: 'gemini-2.5-pro (<200K context length)',
		inputPer1MTokens: 1.25,
		cacheInputPer1MTokens: 0.125,
		outputPer1MTokens: 10.0,
	},
	'gemini-2.5-pro (>200K context length)': {
		modelName: 'gemini-2.5-pro (>200K context length)',
		inputPer1MTokens: 2.5,
		cacheInputPer1MTokens: 0.25,
		outputPer1MTokens: 15.0,
	},
	'gemini-2.5-flash': {
		modelName: 'gemini-2.5-flash',
		inputPer1MTokens: 0.3,
		cacheInputPer1MTokens: 0.03,
		outputPer1MTokens: 2.5,
	},
	'gemini-2.5-flash-lite': {
		modelName: 'gemini-2.5-flash-lite',
		inputPer1MTokens: 0.1,
		cacheInputPer1MTokens: 0.01,
		outputPer1MTokens: 0.4,
	},
	'gemini-2.0-flash': {
		modelName: 'gemini-2.0-flash',
		inputPer1MTokens: 0.1,
		cacheInputPer1MTokens: 0.025,
		outputPer1MTokens: 0.4,
	},
	'gemini-2.0-flash-lite': {
		modelName: 'gemini-2.0-flash-lite',
		inputPer1MTokens: 0.075,
		cacheInputPer1MTokens: undefined,
		outputPer1MTokens: 0.3,
	},
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Embedding models
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export const pricingGeminiEmbedding: PricingPerModel = {
	'gemini-embedding-2': {
		modelName: 'gemini-embedding-2',
		inputPer1MTokens: 0.2,
		cacheInputPer1MTokens: 0,
		outputPer1MTokens: 0,
	},
	'gemini-embedding-001': {
		modelName: 'gemini-embedding-001',
		inputPer1MTokens: 0.15,
		cacheInputPer1MTokens: 0,
		outputPer1MTokens: 0,
	},
}

/**
 * Models whose pricing varies with prompt size (<=200K vs >200K input tokens).
 * Used by the calculator to decide whether to append a context-length suffix to the model name
 * before looking up pricing.
 */
export const GEMINI_TIERED_MODELS: ReadonlySet<string> = new Set([
	'gemini-2.5-pro',
	'gemini-3.1-pro-preview',
]);
