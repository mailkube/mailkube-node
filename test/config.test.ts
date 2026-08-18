import { afterEach, describe, expect, it } from "vitest";

import { Config, DEFAULT_BASE_URL } from "../src/config.js";
import { MailkubeError } from "../src/errors.js";
import { version } from "../src/version.js";

const KEY_VAR = "MAILKUBE_API_KEY";
const URL_VAR = "MAILKUBE_BASE_URL";

afterEach(() => {
  delete process.env[KEY_VAR];
  delete process.env[URL_VAR];
});

describe("Config", () => {
  it("prefers an explicit key", () => {
    expect(new Config({ apiKey: "mk_explicit" }).apiKey).toBe("mk_explicit");
  });

  it("falls back to the environment for the key", () => {
    process.env[KEY_VAR] = "mk_from_env";

    expect(new Config().apiKey).toBe("mk_from_env");
  });

  it("falls back to the environment then the default for the base URL", () => {
    process.env[KEY_VAR] = "mk_from_env";
    expect(new Config().baseUrl).toBe(DEFAULT_BASE_URL);

    process.env[URL_VAR] = "https://staging.example.com/v1/";
    expect(new Config().baseUrl).toBe("https://staging.example.com/v1/");
  });

  it("throws an actionable error when no key is available", () => {
    expect(() => new Config()).toThrow(/No API key provided/);
  });

  it("carries the installed version in the user agent, not a literal", () => {
    expect(new Config({ apiKey: "mk_test" }).defaultHeaders()["User-Agent"]).toBe(
      `mailkube-node/${version}`,
    );
  });

  it("reports a bare version in the user agent, never a `v`-prefixed tag", () => {
    // The contract's row is `mailkube-<lang>/<version>`. The assertion above cannot catch a stray
    // prefix, because both sides would carry it; this one can. The version is derived from
    // `package.json`, not from the `v${version}` git tag, and must stay that way.
    const agent = new Config({ apiKey: "mk_test" }).defaultHeaders()["User-Agent"] ?? "";

    expect(agent).toMatch(/^mailkube-node\/\d/);
  });

  it("joins a relative path onto the base URL", () => {
    expect(new Config({ apiKey: "mk_test" }).buildUrl("emails")).toBe(`${DEFAULT_BASE_URL}emails`);
  });

  it("accepts an absolute URL on the same origin", () => {
    const link = `${DEFAULT_BASE_URL}emails?page=2`;

    expect(new Config({ apiKey: "mk_test" }).buildUrl(link)).toBe(link);
  });

  it("refuses a link off the configured origin", () => {
    // Every request carries the API key, so a foreign host must never be followed.
    expect(() =>
      new Config({ apiKey: "mk_test" }).buildUrl("https://evil.example.com/emails"),
    ).toThrow(MailkubeError);
  });

  it("defaults the timeout to 30 seconds", () => {
    expect(new Config({ apiKey: "mk_test" }).timeoutMs).toBe(30_000);
  });
});

describe("userAgentSuffix", () => {
  it("appends the caller's token after the SDK's own", () => {
    const config = new Config({ apiKey: "mk_x", userAgentSuffix: "my-cli/1.0.0" });

    expect(config.defaultHeaders()["User-Agent"]).toBe(`mailkube-node/${version} my-cli/1.0.0`);
  });

  it("ignores a suffix that could split the header", () => {
    // Dropped rather than sanitized: repairing it would hide the caller's bug. Asserting the exact
    // header, not just the absence of the injected name, is what distinguishes the two: a stripped
    // or escaped value would also fail to contain `X-Injected` while still reaching the wire.
    const config = new Config({ apiKey: "mk_x", userAgentSuffix: "bad\r\nX-Injected: 1" });

    expect(config.defaultHeaders()["User-Agent"]).not.toContain("X-Injected");
    expect(config.defaultHeaders()["User-Agent"]).toBe(`mailkube-node/${version}`);
  });

  it("treats a blank suffix as absent", () => {
    const config = new Config({ apiKey: "mk_x", userAgentSuffix: "   " });

    expect(config.defaultHeaders()["User-Agent"]?.endsWith(" ")).toBe(false);
    expect(config.defaultHeaders()["User-Agent"]).toBe(`mailkube-node/${version}`);
  });

  it("trims surrounding whitespace off a real suffix", () => {
    const config = new Config({ apiKey: "mk_x", userAgentSuffix: "  my-cli/1.0.0\t" });

    expect(config.defaultHeaders()["User-Agent"]).toBe(`mailkube-node/${version} my-cli/1.0.0`);
  });
});
