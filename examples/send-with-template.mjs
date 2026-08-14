// Render a saved template instead of raw content.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/send-with-template.mjs you@example.com <template-uuid>
//
// A send carries EITHER raw content (html/text) OR a template. Sending both is a validation
// error, and the server is the authority on that: the SDK does not pre-judge it.

import { Mailkube, InvalidRequestError } from "../dist/index.js";

const [recipient, templateId] = process.argv.slice(2);
if (!recipient || !templateId) {
  console.error(
    "usage: node examples/send-with-template.mjs <recipient@example.com> <template-id>",
  );
  process.exit(2);
}

const client = new Mailkube();

try {
  const email = await client.emails.send({
    from: "Acme <hello@yourdomain.com>",
    to: recipient,
    subject: "Your order shipped",
    templateId,
    templateVersion: "latest",
    variables: { first_name: "Sam", order_id: "1234" },
  });
  console.log(`accepted ${email.id} from template ${templateId}`);
} catch (error) {
  if (error instanceof InvalidRequestError) {
    // e.g. missing_required_variable, when the template declares a placeholder you did not supply.
    console.error(`${error.errorName}: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
