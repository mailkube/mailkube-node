import { describe, expect, it } from "vitest";

import { MailkubeError, NotFoundError } from "../src/errors.js";
import { BASE_URL, makeClient } from "./helpers.js";

const ITEM = {
  id: "sch_1",
  object: "scheduled_email",
  status: "scheduled",
  scheduled_at: "2026-08-20T07:00:00Z",
  created_at: "2026-08-13T07:00:00Z",
  message_id: "<sch_1@msg>",
  batch_id: "batch-a",
  subject: "Hello",
  recipients: "a@b.com +2",
  topic: "newsletter",
  tags: [{ name: "campaign", value: "launch" }],
};

/**
 * Build a page payload.
 * @param items - The rows on this page.
 * @param next - The link to the following page, if any.
 * @returns The page body as the server sends it.
 */
function page(items: unknown[], next?: string): Record<string, unknown> {
  return {
    pagination: {
      // The server OMITS a step at the ends of the range rather than sending null.
      steps: next === undefined ? {} : { next },
      total_count: 2,
      current_page: 1,
    },
    data: items,
  };
}

describe("scheduledEmails.list", () => {
  it("gets the collection with no query when unfiltered", async () => {
    const { client, stub } = makeClient({ body: page([ITEM]) });
    await client.scheduledEmails.list();

    expect(stub.calls[0]?.method).toBe("GET");
    expect(stub.calls[0]?.url).toBe(`${BASE_URL}scheduled-emails`);
  });

  it("renders every filter, comma-joining a multi-status", async () => {
    const { client, stub } = makeClient({ body: page([]) });
    await client.scheduledEmails.list({
      status: ["scheduled", "canceled"],
      batchId: "batch-a",
      scheduledAtGte: new Date("2026-08-20T07:00:00Z"),
      scheduledAtLte: "2026-08-21T07:00:00Z",
      page: 2,
    });

    const url = new URL(stub.calls[0]?.url ?? "");
    expect(url.searchParams.get("status")).toBe("scheduled,canceled");
    expect(url.searchParams.get("batch_id")).toBe("batch-a");
    expect(url.searchParams.get("scheduled_at_gte")).toBe("2026-08-20T07:00:00.000Z");
    expect(url.searchParams.get("scheduled_at_lte")).toBe("2026-08-21T07:00:00Z");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("parses the page, its rows and its tags", async () => {
    const { client } = makeClient({ body: page([ITEM], `${BASE_URL}scheduled-emails?page=2`) });
    const result = await client.scheduledEmails.list();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "sch_1",
      messageId: "<sch_1@msg>",
      status: "scheduled",
      scheduledAt: "2026-08-20T07:00:00Z",
      createdAt: "2026-08-13T07:00:00Z",
      batchId: "batch-a",
      recipients: "a@b.com +2",
      topic: "newsletter",
    });
    expect(result.data[0]?.tags).toEqual([{ name: "campaign", value: "launch" }]);
    expect(result.pagination.totalCount).toBe(2);
    expect(result.pagination.currentPage).toBe(1);
    expect(result.hasMore).toBe(true);
  });

  it("survives a terminal page that omits the fields it has nothing to say about", async () => {
    // The last page carries no `next`, and some deployments omit total_count/current_page too.
    // A required reader would throw here — which is exactly where a listing terminates.
    const { client } = makeClient({ body: { pagination: { steps: {} }, data: [] } });
    const result = await client.scheduledEmails.list();

    expect(result.hasMore).toBe(false);
    expect(result.pagination.totalCount).toBe(0);
    expect(result.pagination.currentPage).toBe(1);
    expect(result.data).toEqual([]);
  });
});

describe("scheduledEmails.iterAll", () => {
  it("follows the server's next link across pages", async () => {
    const { client, stub } = makeClient([
      { body: page([ITEM], `${BASE_URL}scheduled-emails?page=2`) },
      { body: page([{ ...ITEM, id: "sch_2" }]) },
    ]);

    const seen: string[] = [];
    for await (const item of client.scheduledEmails.iterAll({ status: "scheduled" })) {
      seen.push(item.id);
    }

    expect(seen).toEqual(["sch_1", "sch_2"]);
    expect(stub.calls).toHaveLength(2);
    // The second request is the link the server issued, not a page counter the SDK invented.
    expect(stub.calls[1]?.url).toBe(`${BASE_URL}scheduled-emails?page=2`);
  });

  it("costs nothing to abandon early", async () => {
    const { client, stub } = makeClient([
      { body: page([ITEM], `${BASE_URL}scheduled-emails?page=2`) },
      { body: page([{ ...ITEM, id: "sch_2" }]) },
    ]);

    for await (const item of client.scheduledEmails.iterAll()) {
      expect(item.id).toBe("sch_1");
      break;
    }

    expect(stub.calls).toHaveLength(1);
  });

  it("refuses to follow a next link off the configured origin", async () => {
    // Every request carries the API key, so a foreign host must never be followed.
    const { client } = makeClient([
      { body: page([ITEM], "https://evil.example.com/scheduled-emails?page=2") },
    ]);

    const walk = async (): Promise<number> => {
      let seen = 0;
      for await (const item of client.scheduledEmails.iterAll()) {
        seen += item.id.length;
      }
      return seen;
    };

    await expect(walk()).rejects.toBeInstanceOf(MailkubeError);
  });

  it("carries a caller's signal onto the pages it has not fetched yet", async () => {
    const controller = new AbortController();
    const { client, stub } = makeClient([
      { body: page([ITEM], `${BASE_URL}scheduled-emails?page=2`) },
      { body: page([{ ...ITEM, id: "sch_2" }]) },
    ]);

    let seen = 0;
    for await (const item of client.scheduledEmails.iterAll({}, { signal: controller.signal })) {
      seen += item.id.length;
    }

    expect(seen).toBeGreaterThan(0);
    expect(stub.calls).toHaveLength(2);
    controller.abort();
    expect(stub.calls[1]?.signal?.aborted).toBe(true);
  });
});

describe("scheduledEmails item verbs", () => {
  it("retrieves one", async () => {
    const { client, stub } = makeClient({ body: ITEM });
    const item = await client.scheduledEmails.get("sch_1");

    expect(stub.calls[0]?.method).toBe("GET");
    expect(stub.calls[0]?.url).toBe(`${BASE_URL}scheduled-emails/sch_1`);
    expect(item.id).toBe("sch_1");
  });

  it("reschedules with PATCH, never POST", async () => {
    const { client, stub } = makeClient({ body: ITEM });
    await client.scheduledEmails.update("sch_1", {
      scheduledAt: new Date("2026-08-21T07:00:00Z"),
      batchId: "batch-b",
    });

    expect(stub.calls[0]?.method).toBe("PATCH");
    expect(stub.calls[0]?.body).toEqual({
      scheduled_at: "2026-08-21T07:00:00.000Z",
      batch_id: "batch-b",
    });
  });

  it("omits batch_id when the caller did not move the email", async () => {
    const { client, stub } = makeClient({ body: ITEM });
    await client.scheduledEmails.update("sch_1", { scheduledAt: "2026-08-21T07:00:00Z" });

    expect(stub.calls[0]?.body).toEqual({ scheduled_at: "2026-08-21T07:00:00Z" });
  });

  it("cancels with DELETE and parses the acknowledgement", async () => {
    const { client, stub } = makeClient({
      body: { id: "sch_1", object: "scheduled_email", status: "canceled" },
    });
    const result = await client.scheduledEmails.cancel("sch_1");

    expect(stub.calls[0]?.method).toBe("DELETE");
    expect(result).toEqual({ id: "sch_1", object: "scheduled_email", status: "canceled" });
  });

  it("escapes an identifier so it cannot re-target the route", async () => {
    const { client, stub } = makeClient({ body: ITEM });
    await client.scheduledEmails.get("../batches/evil?x=1");

    expect(stub.calls[0]?.url).toBe(`${BASE_URL}scheduled-emails/..%2Fbatches%2Fevil%3Fx%3D1`);
  });

  it("maps a 404 like every other verb", async () => {
    const { client } = makeClient({ status: 404, body: { name: "not_found", message: "gone" } });

    await expect(client.scheduledEmails.get("sch_missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("treats a body without an id as an SDK error", async () => {
    const { client } = makeClient({ body: { object: "scheduled_email" } });

    await expect(client.scheduledEmails.get("sch_1")).rejects.toBeInstanceOf(MailkubeError);
  });
});

describe("scheduledEmails.batches", () => {
  it("reschedules a whole batch, identifying it by path only", async () => {
    const { client, stub } = makeClient({
      body: {
        object: "scheduled_email.batch",
        batch_id: "batch-a",
        rescheduled_count: 3,
        scheduled_at: "2026-08-21T07:00:00Z",
      },
    });
    const result = await client.scheduledEmails.batches.update("batch-a", {
      scheduledAt: "2026-08-21T07:00:00Z",
    });

    expect(stub.calls[0]?.method).toBe("PATCH");
    expect(stub.calls[0]?.url).toBe(`${BASE_URL}scheduled-emails/batches/batch-a`);
    // No batch_id in the body: the server rejects a second one rather than choose.
    expect(stub.calls[0]?.body).toEqual({ scheduled_at: "2026-08-21T07:00:00Z" });
    expect(result.rescheduledCount).toBe(3);
  });

  it("cancels a whole batch, and an unknown batch is a no-op not an error", async () => {
    const { client, stub } = makeClient({
      body: { object: "scheduled_email.batch", batch_id: "nope", canceled_count: 0 },
    });
    const result = await client.scheduledEmails.batches.cancel("nope");

    expect(stub.calls[0]?.method).toBe("DELETE");
    expect(stub.calls[0]?.url).toBe(`${BASE_URL}scheduled-emails/batches/nope`);
    expect(result.canceledCount).toBe(0);
  });

  it("defaults the counts when the server omits them", async () => {
    const { client } = makeClient({ body: { object: "scheduled_email.batch" } });
    const result = await client.scheduledEmails.batches.update("batch-a", {
      scheduledAt: "2026-08-21T07:00:00Z",
    });

    expect(result).toEqual({
      object: "scheduled_email.batch",
      batchId: "",
      rescheduledCount: 0,
      scheduledAt: undefined,
    });
  });
});
