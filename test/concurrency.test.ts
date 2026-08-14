/**
 * The client is safe to share across concurrent callers, and this proves it.
 *
 * `SDK_CONTRACT.md` requires more than "no exception was thrown": it requires that concurrent
 * calls **do not observe each other's responses**. A client holding mutable per-request state
 * does not throw when two callers overlap, it hands one caller the other's body, which is a
 * confidentiality bug that any weaker assertion sails straight past.
 *
 * The shape is therefore: issue N calls whose requests are distinguishable (a distinct
 * `Idempotency-Key` each), have the stub echo that value back as the response `id`, and assert
 * every caller received **its own** value.
 *
 * **The stub holds every request until all N have arrived, then settles them in one turn**,
 * which buys two things a per-request delay cannot. It *proves* the calls genuinely overlap: a
 * client that serialized them would never fill the barrier and the test would time out rather
 * than quietly passing on a client it never stressed. And every continuation is queued in the
 * same microtask drain, so they contend for real. That second property is load-bearing: with
 * `setTimeout` delays, Node drains microtasks between timer callbacks, so each call ran to
 * completion before the next was answered and a deliberately broken client still passed.
 *
 * The stub is also deliberately local rather than `helpers.ts`'s `stubFetch`: that one answers
 * every request with the same canned body, so it could not tell the responses apart at all.
 */
import { describe, expect, it } from "vitest";

import { Mailkube } from "../src/client.js";

/** How many callers overlap, and therefore how many parties the barrier waits for. */
const CALLS = 32;

const MINIMAL = { from: "a@x.com", to: "b@y.com", subject: "Hi" };

/**
 * Build a stub fetch that echoes each request's idempotency key as its resource id, answering
 * nobody until every caller has arrived.
 * @returns A fetch implementation suitable for the client's `fetch` option.
 */
function echoFetch(): typeof globalThis.fetch {
  const waiting: (() => void)[] = [];
  return (_input, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const key = headers["Idempotency-Key"] ?? "";
    return new Promise<Response>((resolve) => {
      waiting.push(() => {
        resolve(new Response(JSON.stringify({ id: key }), { status: 200 }));
      });
      if (waiting.length === CALLS) {
        // Released newest-first, in one synchronous pass, so no client can look correct merely
        // by processing replies in the order it sent them.
        const newestFirst = [...waiting];
        newestFirst.reverse();
        for (const release of newestFirst) {
          release();
        }
      }
    });
  };
}

describe("concurrent use of one client", () => {
  it("does not let concurrent calls observe each other's responses", async () => {
    const client = new Mailkube({ apiKey: "mk_test", fetch: echoFetch() });
    const keys = Array.from({ length: CALLS }, (_, i) => `idem-${String(i).padStart(3, "0")}`);

    const received = await Promise.all(
      keys.map(async (key) => {
        const email = await client.emails.send({ ...MINIMAL, idempotencyKey: key });
        return email.id;
      }),
    );

    received.forEach((got, i) => {
      expect(
        got,
        `${keys[i]} received the response for "${got}": concurrent calls observed each other`,
      ).toBe(keys[i]);
    });
  });
});
