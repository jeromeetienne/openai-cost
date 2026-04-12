
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
				// IMPORTANT: Do NOT await this call. Here is why:
				//
				// Why no await:
				// - response.clone() tees the stream, creating two independent readers: the original and the clone.
				// - The callback receives the clone and reads it fully to extract usage data (e.g. the "response.completed" SSE event).
				// - If we awaited, the callback would consume the entire cloned stream before we return the original response
				//   to the caller. This would block the caller from receiving any chunks until the full response is done,
				//   effectively defeating streaming (all chunks arrive at once instead of incrementally).
				// - Without await, the original response is returned immediately to the caller, who can iterate chunks in real-time.
				//   Meanwhile, the callback reads the cloned stream in the background independently.
				//
				// Why concurrent callbacks are safe:
				// - Node.js is single-threaded. Even with multiple unawaited callbacks in flight, JavaScript never executes
				//   two statements at the exact same time. Concurrency is cooperative — code runs until it hits an await,
				//   then another pending task gets a turn.
				// - The SQLite write (better-sqlite3's insertStmt.run()) is synchronous — it executes atomically in a single
				//   tick of the event loop. No other code can interleave between prepare and run.
				// - Each callback works with its own response clone and local variables. The only shared resource is the
				//   database connection, and synchronous single-statement INSERTs cannot corrupt each other.
				trackerCallback(bucketId, input, init, response.clone());
			}

			return response
		}
		// return the tracker function that will be passed to OpenAI client
		return fetchTracker;
	}

}