// local imports
import { PricingPerModel } from "./pricing-types";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenAI pricing tables
//	from https://developers.openai.com/api/docs/pricing
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

export const pricingOpenAiLlm: PricingPerModel = {
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
//	Embedding models
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export const pricingOpenAiEmbedding: PricingPerModel = {
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
