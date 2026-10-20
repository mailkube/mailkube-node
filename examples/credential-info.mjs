// Describe the API key this client authenticates with: its domain, organization, plan and
// send-quota usage. Nothing is sent, and the key itself is never printed.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/credential-info.mjs
//
// The key is checked exactly as a send checks it, so this is also how to verify a key before
// using it: a key that cannot send raises AuthenticationError (`invalid_api_key`). The call
// counts as a use of the key, and plan figures can be up to 30 seconds old.

import { Mailkube, AuthenticationError, MailkubeError } from "../dist/index.js";

const client = new Mailkube(); // reads MAILKUBE_API_KEY

try {
  const key = await client.credential.info();
  console.log(`key ${key.keyId} (${key.name}) sends for ${key.domain.name}`);
  console.log(`organization ${key.organization.name} (${key.organization.alias})`);
  console.log(`allowed from ${key.allowedSourceIps.join(", ") || "any address"}`);

  // A plan without a daily limit lists the monthly quota only; an absent quota is no limit.
  if (key.plan === undefined) {
    console.log("no subscription");
  } else {
    console.log(`plan ${key.plan.name} (${key.plan.status})`);
    for (const quota of key.plan.quotas) {
      console.log(`  ${quota.name}: ${quota.used} of ${quota.limit} recipients in ${quota.period}`);
    }
  }
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error(`this key cannot send: ${error.errorName}`);
    process.exit(1);
  }
  if (error instanceof MailkubeError) {
    console.error(`${error.name}: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
