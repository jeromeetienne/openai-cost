
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Type
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// get type for fetch() function and its parameters/return type
type OpenAICallTrackerFetchFn = typeof globalThis.fetch;
type OpenAICallTrackerFetchInput = string | URL | Request;
type OpenAICallTrackerFetchInit = RequestInit | undefined;
type OpenAICallTrackerFetchResponse = Response;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenAI Cost Tracker
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export type OpenAICallTrackerCallback = (
	bucketId: string,
	input: string | URL | Request,
	init: RequestInit | undefined,
	response: Response
) => Promise<void>;

export class OpenAICallTracker {

	/**
	 * This function returns a fetch function that can be passed to the OpenAI client. It is designed to track the usage of OpenAI API calls 
	 * It is aimed to allow the caller to compute the cost based on the usage information returned in the response.
	 * 
	 * @param bucketId - an identifier for the tracker, used to group usage information (default: 'openai_call_bucket')
	 * @param trackerCallback - a callback function that will be called with Response for each API call
	 * @param originalFetch - the original fetch function to use for making API calls (default: global fetch)
	 * @returns a fetch function that can be passed to the OpenAI client
	 */
	static async getFetchFn(trackerCallback: OpenAICallTrackerCallback, {
		bucketId = `openai_call_bucket`,
		originalFetch = fetch
	}: {
		bucketId?: string,
		originalFetch?: (input: OpenAICallTrackerFetchInput, init?: OpenAICallTrackerFetchInit) => Promise<OpenAICallTrackerFetchResponse>
	} = {}
	): Promise<(input: OpenAICallTrackerFetchInput, init?: OpenAICallTrackerFetchInit) => Promise<OpenAICallTrackerFetchResponse>> {

		async function fetchTracker(input: OpenAICallTrackerFetchInput, init?: OpenAICallTrackerFetchInit): Promise<OpenAICallTrackerFetchResponse> {
			// Call the original fetch function to get the response
			const response = await originalFetch(input, init)

			if (trackerCallback) {
				// TODO should we do that await?
				// this will wait up to the end of the stream ... and then... deliver the first chunk to the caller
				await trackerCallback(bucketId, input, init, response.clone());
			}

			return response
		}
		// return the tracker function that will be passed to OpenAI client
		return fetchTracker;
	}

}