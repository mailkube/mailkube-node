// Verify a webhook signature without running a server.
//
//   npm run build
//   node examples/verify-webhook.mjs path/to/fixture.json
//
// The receiver examples show verification inside a framework. This one strips that away: it feeds
// captured deliveries straight to `verify` so you can see exactly what is accepted and what is
// not. Useful for testing your own handler against saved payloads.
//
// A fixture is JSON: { secret, headers: {...}, body: "<raw body string>", must_verify: bool }.
// The body must be the EXACT bytes the server sent — re-serializing parsed JSON will not
// reproduce the signature, which is the single most common integration bug.

import { readFile } from "node:fs/promises";

import { verify, SignatureVerificationError } from "../dist/index.js";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("usage: node examples/verify-webhook.mjs <fixture.json> [more.json...]");
  process.exit(2);
}

let failures = 0;

for (const path of paths) {
  const fixture = JSON.parse(await readFile(path, "utf8"));
  const rawBody = Buffer.from(fixture.body, "utf8");

  let verified = false;
  let detail;
  try {
    const event = await verify(rawBody, fixture.headers, fixture.secret);
    verified = true;
    detail = `event ${event.type}`;
  } catch (error) {
    if (error instanceof SignatureVerificationError) {
      detail = error.message;
    } else {
      throw error;
    }
  }

  const expected = fixture.must_verify === true;
  const ok = verified === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "ok  " : "BAD "} ${fixture.name ?? path}: ${verified ? "verified" : "rejected"} ` +
      `(expected ${expected ? "verified" : "rejected"}) ${detail}`,
  );
}

if (failures > 0) {
  console.error(`${failures} fixture(s) did not verify as expected`);
  process.exit(1);
}
console.log("all fixtures behaved as expected");
