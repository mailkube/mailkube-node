// Attach a file to a send.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/send-with-attachments.mjs you@example.com
//
// `content` takes either raw bytes or an already-base64 string. Bytes are encoded by the SDK
// without ever touching `Buffer`, which is what lets the same code run on a Worker.

import { readFile } from "node:fs/promises";

import { Mailkube } from "../dist/index.js";

const recipient = process.argv[2];
if (!recipient) {
  console.error("usage: node examples/send-with-attachments.mjs <recipient@example.com>");
  process.exit(2);
}

const client = new Mailkube();

// Any Uint8Array will do; a Buffer from node:fs is one.
const report = new Uint8Array(await readFile(new URL("../package.json", import.meta.url)));

const email = await client.emails.send({
  from: "Acme <hello@yourdomain.com>",
  to: recipient,
  subject: "Your report",
  text: "The report is attached.",
  attachments: [
    { filename: "report.json", content: report, contentType: "application/json" },
    // Already encoded elsewhere? Pass the string through untouched.
    { filename: "note.txt", content: btoa("nothing to see here") },
  ],
});

console.log(`accepted ${email.id} with 2 attachments`);
