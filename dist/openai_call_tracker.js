"use strict";
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Type
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAICallTracker = void 0;
class OpenAICallTracker {
    /**
     * This function returns a fetch function that can be passed to the OpenAI client. It is designed to track the usage of OpenAI API calls
     * It is aimed to allow the caller to compute the cost based on the usage information returned in the response.
     *
     * @param bucketId - an identifier for the tracker, used to group usage information (default: 'openai_call_bucket')
     * @param trackerCallback - a callback function that will be called with Response for each API call
     * @param originalFetch - the original fetch function to use for making API calls (default: global fetch)
     * @returns a fetch function that can be passed to the OpenAI client
     */
    static async getFetchFn(trackerCallback, { bucketId = `openai_call_bucket`, originalFetch = fetch } = {}) {
        async function fetchTracker(input, init) {
            // Call the original fetch function to get the response
            const response = await originalFetch(input, init);
            if (trackerCallback) {
                await trackerCallback(bucketId, response.clone());
            }
            return response;
        }
        // return the tracker function that will be passed to OpenAI client
        return fetchTracker;
    }
}
exports.OpenAICallTracker = OpenAICallTracker;
//# sourceMappingURL=openai_call_tracker.js.map