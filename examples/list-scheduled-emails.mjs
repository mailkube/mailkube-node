// List the sends still waiting to go out: one page for the metadata, then the lazy walk for the
// rows. Read-only: nothing is scheduled, moved or canceled.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/list-scheduled-emails.mjs
//
// `list` returns one page plus its pagination block. `iterAll` follows the links the server
// issues, one page at a time, and fetches the next page only once the loop asks for it, so the
// `break` below means the remaining pages are never requested at all.

import { Mailkube, MailkubeError } from "../dist/index.js";

const client = new Mailkube(); // reads MAILKUBE_API_KEY
const shown = 20;

try {
  const first = await client.scheduledEmails.list({ status: "scheduled" });
  const { currentPage, totalCount } = first.pagination;
  console.log(
    `page ${currentPage}: ${first.data.length} of ${totalCount} scheduled, more: ${first.hasMore}`,
  );

  let count = 0;
  for await (const email of client.scheduledEmails.iterAll({ status: "scheduled" })) {
    console.log(
      `${email.scheduledAt}  ${email.id}  ${email.batchId ?? "-"}  ${email.subject ?? ""}`,
    );
    count += 1;
    if (count === shown) {
      console.log(`stopped after ${shown}; later pages were never fetched`);
      break;
    }
  }
} catch (error) {
  if (error instanceof MailkubeError) {
    console.error(`${error.name}: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
