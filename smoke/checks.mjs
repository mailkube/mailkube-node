// The runtime smoke checks, shared by every runtime entry point.
//
// These run against the PACKED TARBALL installed into a temp directory, not against `src/`, so
// they exercise exactly what a consumer installs: the exports map, the built output, and whatever
// host globals the package reached for. Every assertion here exists because it fails loudly on at
// least one target runtime if the package regresses:
//
//   - `version`           the build baked in the version instead of reading package.json at runtime
//   - `new Mailkube({})`  `readEnv` returned undefined instead of throwing where env is unreadable
//                         (Deno defines `process` and then throws on access without --allow-env)
//   - attachment base64   `encodeBase64` replaced `Buffer`, which does not exist off Node
//   - webhook verify      `crypto.subtle` replaced `node:crypto`, and it verifies over raw bytes
//   - abort               `AbortSignal.any` merges the caller's signal with the client timeout
//
// Plain ESM JavaScript with no imports beyond the SDK itself: the file is loaded by Node, Deno,
// Bun and workerd alike, so it can only use what all four provide.

const SECRET = "whsec_smoke";
const BODY = '{"type":"email.sent","data":{"email_id":"e_1"}}';
const BASE_URL = "https://api.mailkube.com/mta/v1/";
// [0x00, 0x01, 0xfa, 0xff] base64-encoded. Non-UTF8 bytes on purpose: a text round trip mangles it.
const ATTACHMENT_BYTES = new Uint8Array([0x00, 0x01, 0xfa, 0xff]);
const ATTACHMENT_BASE64 = "AAH6/w==";

const MINIMAL = {
  from: "Acme <hello@example.com>",
  to: "customer@example.com",
  subject: "smoke",
  html: "<p>ok</p>",
};

/**
 * Throw unless the condition holds.
 * @param {unknown} condition - What must be true.
 * @param {string} message - What went wrong if it is not.
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`smoke check failed: ${message}`);
  }
}

/**
 * Sign a body the way the platform does, using only WebCrypto.
 * @param {Uint8Array} body - The raw body bytes.
 * @returns {Promise<Record<string, string>>} The signature headers.
 */
async function signHeaders(body) {
  const id = "wh_smoke";
  const timestamp = new Date().toISOString();
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${id}.${timestamp}.`);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix, 0);
  message.set(body, prefix.length);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const hex = Array.from(mac, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return { "X-Webhook-Id": id, "X-Webhook-Ts": timestamp, "X-Webhook-Sig": `sha256=${hex}` };
}

/**
 * Run every runtime check against an installed copy of the SDK.
 * @param {Record<string, any>} sdk - The module namespace of the installed `mailkube` package.
 * @param {string} expectedVersion - The version the installed package.json declares.
 * @returns {Promise<string>} A one-line summary, for the CI log.
 */
export async function runChecks(sdk, expectedVersion) {
  const { Mailkube, MailkubeError, verifySignature, version } = sdk;

  assert(typeof Mailkube === "function", "Mailkube is not exported");
  assert(typeof verifySignature === "function", "verifySignature is not exported");
  assert(
    version === expectedVersion,
    `reported version ${version} is not the installed version ${expectedVersion}`,
  );

  // No baseUrl and no ambient environment: the client must resolve from the explicit key alone.
  const calls = [];
  const client = new Mailkube({
    apiKey: "mk_smoke",
    fetch: (input, init) => {
      calls.push({
        url: String(input),
        signal: init?.signal,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      return Promise.resolve(new Response(JSON.stringify({ id: "e_1" }), { status: 200 }));
    },
  });

  const email = await client.emails.send({
    ...MINIMAL,
    attachments: [{ filename: "a.bin", content: ATTACHMENT_BYTES }],
  });
  assert(email.id === "e_1", "send did not parse the response id");
  assert(calls[0].url === `${BASE_URL}emails`, `send hit ${calls[0].url}`);
  assert(
    calls[0].body.attachments[0].content === ATTACHMENT_BASE64,
    `attachment encoded as ${calls[0].body.attachments[0].content}, expected ${ATTACHMENT_BASE64}`,
  );

  // A missing key must surface as the SDK's own error, never as a host permission error. This is
  // the check that catches an unguarded environment read on Deno.
  let constructError;
  try {
    new Mailkube({});
  } catch (error) {
    constructError = error;
  }
  assert(
    constructError instanceof MailkubeError,
    `a missing key threw ${constructError?.name ?? "nothing"}: ${constructError?.message ?? "-"}`,
  );

  // Webhook verification, over raw bytes, on WebCrypto.
  const body = new TextEncoder().encode(BODY);
  const headers = await signHeaders(body);
  assert(
    (await verifySignature(body, headers, SECRET)) === body,
    "verifySignature did not return the caller's bytes",
  );

  let tamperedRejected = false;
  try {
    await verifySignature(new TextEncoder().encode('{"type":"tampered"}'), headers, SECRET);
  } catch {
    tamperedRejected = true;
  }
  assert(tamperedRejected, "a tampered body verified");

  // Caller cancellation must reach fetch, merged with the client's timeout.
  const controller = new AbortController();
  await client.emails.send({ ...MINIMAL, signal: controller.signal });
  const observed = calls[calls.length - 1].signal;
  assert(observed, "no signal reached fetch");
  assert(observed.aborted === false, "the request signal was already aborted");
  controller.abort();
  assert(observed.aborted === true, "aborting the caller's controller did not abort the request");

  return `mailkube ${version}: ${calls.length} requests, all runtime checks passed`;
}
