import { describe, expect, it } from "vitest";

import { AuthenticationError, ErrorName, MailkubeError, RateLimitError } from "../src/errors.js";
import { BASE_URL, makeClient } from "./helpers.js";

const MONTHLY = {
  name: "emails_per_month",
  limit: 50000,
  used: 9310,
  remaining: 40690,
  period: "2026-10",
};

const KEY = {
  object: "api_key",
  key_id: "k3v9x2m8q1w7r4t6y0p5s2a8",
  name: "production-backend",
  description: null,
  created_at: "2026-09-02T08:14:03Z",
  last_auth_at: "2026-10-19T16:41:22Z",
  allowed_source_ips: ["203.0.113.0/24"],
  domain: { name: "example.com" },
  organization: { name: "Example Ltd", alias: "example" },
  plan: {
    code: "00000000-0000-0000-0000-000000000003",
    name: "Momentum",
    status: "active",
    quotas: [
      {
        name: "emails_per_day",
        limit: 5000,
        used: 120,
        remaining: 4880,
        period: "2026-10-19",
      },
      MONTHLY,
    ],
  },
};

describe("credential.info", () => {
  it("gets the calling key's own description, with no body", async () => {
    const { client, stub } = makeClient({ body: KEY });
    await client.credential.info();

    expect(stub.calls[0]?.method).toBe("GET");
    expect(stub.calls[0]?.url).toBe(`${BASE_URL}api-keys/me`);
    expect(stub.calls[0]?.body).toBeUndefined();
    expect(stub.calls[0]?.headers["Idempotency-Key"]).toBeUndefined();
  });

  it("decodes the key, its domain, organization and plan", async () => {
    const { client } = makeClient({ body: KEY });

    expect(await client.credential.info()).toEqual({
      object: "api_key",
      keyId: "k3v9x2m8q1w7r4t6y0p5s2a8",
      name: "production-backend",
      description: undefined,
      createdAt: "2026-09-02T08:14:03Z",
      lastAuthAt: "2026-10-19T16:41:22Z",
      allowedSourceIps: ["203.0.113.0/24"],
      domain: { name: "example.com" },
      organization: { name: "Example Ltd", alias: "example" },
      plan: {
        code: "00000000-0000-0000-0000-000000000003",
        name: "Momentum",
        status: "active",
        quotas: [
          { name: "emails_per_day", limit: 5000, used: 120, remaining: 4880, period: "2026-10-19" },
          {
            name: "emails_per_month",
            limit: 50000,
            used: 9310,
            remaining: 40690,
            period: "2026-10",
          },
        ],
      },
    });
  });

  it("reads a null plan as no plan, never as an empty one", async () => {
    const { client } = makeClient({ body: { ...KEY, plan: null } });

    expect((await client.credential.info()).plan).toBeUndefined();
  });

  it("reads an absent plan as no plan", async () => {
    const withoutPlan = Object.fromEntries(
      Object.entries(KEY).filter(([field]) => field !== "plan"),
    );
    const { client } = makeClient({ body: withoutPlan });

    expect((await client.credential.info()).plan).toBeUndefined();
  });

  it("keeps a monthly-only plan monthly-only, synthesizing no daily quota", async () => {
    const { client } = makeClient({ body: { ...KEY, plan: { ...KEY.plan, quotas: [MONTHLY] } } });

    const info = await client.credential.info();
    expect(info.plan?.quotas.map((quota) => quota.name)).toEqual(["emails_per_month"]);
  });

  it("raises an authentication error for a refused key", async () => {
    const { client } = makeClient({
      status: 403,
      body: { name: ErrorName.InvalidApiKey, message: "API key is invalid" },
    });

    const failure = client.credential.info();
    await expect(failure).rejects.toBeInstanceOf(AuthenticationError);
    await expect(failure).rejects.toMatchObject({ errorName: "invalid_api_key" });
  });

  it("carries Retry-After on a rate limit", async () => {
    const { client } = makeClient({
      status: 429,
      body: { name: "rate_limit_exceeded", message: "slow down" },
      headers: { "Retry-After": "59" },
    });

    await expect(client.credential.info()).rejects.toMatchObject({ retryAfter: 59 });
    await expect(client.credential.info()).rejects.toBeInstanceOf(RateLimitError);
  });

  it("refuses a 2xx body without a key id as an SDK error, not an API error", async () => {
    const { client } = makeClient({ body: { object: "api_key" } });

    const failure = client.credential.info();
    await expect(failure).rejects.toBeInstanceOf(MailkubeError);
    await expect(failure).rejects.not.toBeInstanceOf(AuthenticationError);
  });

  it("passes a signal that aborts when the caller's does", async () => {
    const { client, stub } = makeClient({ body: KEY });
    const controller = new AbortController();
    await client.credential.info({ signal: controller.signal });
    expect(stub.calls[0]?.signal?.aborted).toBe(false);

    controller.abort();
    expect(stub.calls[0]?.signal?.aborted).toBe(true);
  });
});
