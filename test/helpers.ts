/**
 * Shared test helpers: build clients over a stub fetch (no network).
 *
 * The client's `fetch` option is the dependency-inversion seam described in
 * `.rules/SDK_CONTRACT.md`; injecting a stub through it is what keeps the whole suite
 * network-free while still exercising the real request building, error mapping and parsing.
 */
import { Mailkube } from "../src/client.js";
import { DEFAULT_BASE_URL } from "../src/config.js";

export const BASE_URL = DEFAULT_BASE_URL;

/** Whatever the runtime's fetch accepts as its first argument. */
type FetchInput = Parameters<typeof globalThis.fetch>[0];

/** A request captured by the stub fetch. */
export interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
  signal: AbortSignal | null | undefined;
}

/** What the stub fetch should answer with. */
export interface StubResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** A stub fetch plus the requests it saw. */
export interface Stub {
  fetch: typeof globalThis.fetch;
  calls: Captured[];
}

/**
 * Build a stub fetch that records requests and answers with canned responses.
 *
 * A list answers each call in turn and repeats the last entry once exhausted, which is what lets a
 * pagination test hand out a different page per request without a bespoke stub.
 * @param response - The canned response, or one per call in order.
 * @returns The stub and its call log.
 */
export function stubFetch(response: StubResponse | StubResponse[] = {}): Stub {
  const queue = Array.isArray(response) ? response : [response];
  const calls: Captured[] = [];
  const fetchImpl = (input: FetchInput, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined,
      signal: init?.signal,
    });
    const answer = queue[Math.min(calls.length - 1, queue.length - 1)] ?? {};
    const payload = answer.body === undefined ? { id: "abc123" } : answer.body;
    return Promise.resolve(
      new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
        status: answer.status ?? 200,
        headers: answer.headers,
      }),
    );
  };
  return { fetch: fetchImpl, calls };
}

/**
 * Build a client wired to a stub fetch.
 * @param response - The canned response, or one per call in order.
 * @returns The client and the stub's call log.
 */
export function makeClient(response: StubResponse | StubResponse[] = {}): {
  client: Mailkube;
  stub: Stub;
} {
  const stub = stubFetch(response);
  return { client: new Mailkube({ apiKey: "mk_test", fetch: stub.fetch }), stub };
}
