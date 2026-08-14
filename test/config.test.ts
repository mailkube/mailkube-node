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
