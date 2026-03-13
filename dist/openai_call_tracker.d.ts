type FetchFn = typeof globalThis.fetch;
type FetchInput = Parameters<FetchFn>[0];
type FetchInit = Parameters<FetchFn>[1];
type FetchResponse = Awaited<ReturnType<FetchFn>>;
export type OpenAICallTrackerCallback = (bucketId: string, response: Response) => Promise<void>;
export declare class OpenAICallTracker {
    /**
     * This function returns a fetch function that can be passed to the OpenAI client. It is designed to track the usage of OpenAI API calls
     * It is aimed to allow the caller to compute the cost based on the usage information returned in the response.
     *
     * @param bucketId - an identifier for the tracker, used to group usage information (default: 'openai_call_bucket')
     * @param trackerCallback - a callback function that will be called with Response for each API call
     * @param originalFetch - the original fetch function to use for making API calls (default: global fetch)
     * @returns a fetch function that can be passed to the OpenAI client
     */
    static getFetchFn(trackerCallback: OpenAICallTrackerCallback, { bucketId, originalFetch }?: {
        bucketId?: string;
        originalFetch?: (input: FetchInput, init?: FetchInit) => Promise<FetchResponse>;
    }): Promise<(input: FetchInput, init?: FetchInit) => Promise<FetchResponse>>;
}
export {};
