/**
 * The runtime layer: the only modules allowed to name a host global.
 *
 * These are the changes that let the package run off Node, and two of them fail *silently* if they
 * are wrong — base64 that corrupts an attachment still produces valid-looking base64, and an
 * environment read that throws only throws on a runtime this suite does not execute on. Both are
 * therefore pinned against an independent oracle here rather than left to the smoke matrix.
 */
import { describe, expect, it } from "vitest";

import { readEnv } from "../src/runtime/env.js";
import {
  concatBytes,
  decodeHex,
  encodeBase64,
  encodeUtf8,
  toBytes,
} from "../src/runtime/encoding.js";

/** The chunk size `encodeBase64` walks in, mirrored so the boundary cases are the real ones. */
const CHUNK = 0x2000;

/**
 * Replace `globalThis.process` for the duration of one call, then restore it exactly.
 * @param replacement - The stand-in process object, or undefined to remove it.
 * @param body - The code to run against it.
 */
function withProcess(replacement: unknown, body: () => void): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, "process");
  Object.defineProperty(globalThis, "process", { configurable: true, value: replacement });
  try {
    body();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "process", original);
    } else {
      delete (globalThis as { process?: unknown }).process;
    }
  }
}

describe("readEnv", () => {
  it("reads a variable that is set", () => {
    process.env["MAILKUBE_TEST_VAR"] = "present";
    try {
      expect(readEnv("MAILKUBE_TEST_VAR")).toBe("present");
    } finally {
      delete process.env["MAILKUBE_TEST_VAR"];
    }
  });

  it("returns undefined for a variable that is unset", () => {
    expect(readEnv("MAILKUBE_DEFINITELY_UNSET")).toBeUndefined();
  });

  it("returns undefined where there is no process at all", () => {
    // Cloudflare Workers without nodejs_compat: a bare `process.env` is a ReferenceError.
    withProcess(undefined, () => {
      expect(readEnv("MAILKUBE_API_KEY")).toBeUndefined();
    });
  });

  it("returns undefined where reading the environment throws", () => {
    // Deno DOES define globalThis.process, so the optional chain does not save us; the read itself
    // throws `NotCapable: Requires env access` without --allow-env. This is the case a plain
    // `globalThis.process?.env?.[name]` gets wrong.
    const denoLike = {
      get env(): Record<string, string | undefined> {
        throw new Error('NotCapable: Requires env access to "MAILKUBE_API_KEY"');
      },
    };

    withProcess(denoLike, () => {
      expect(readEnv("MAILKUBE_API_KEY")).toBeUndefined();
    });
  });
});

describe("encodeBase64", () => {
  it.each([
    ["empty", 0],
    ["one byte", 1],
    ["one below a chunk", CHUNK - 1],
    ["exactly one chunk", CHUNK],
    ["one above a chunk", CHUNK + 1],
    ["several chunks and a remainder", CHUNK * 3 + 7],
  ])("matches Buffer for %s", (_case, length) => {
    // Every byte value cycles through, so a chunk boundary landing mid-character would show up.
    const bytes = Uint8Array.from({ length }, (_, i) => i % 256);

    // Buffer is the oracle and is confined to this file: `src/` must never name it.
    expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("matches Buffer for a payload larger than the call-stack-safe spread limit", () => {
    // 200k bytes: `String.fromCharCode(...bytes)` in one call would overflow the stack here, which
    // is the whole reason the encoder chunks.
    const bytes = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 7) % 256);

    expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });
});

describe("decodeHex", () => {
  it("round-trips a digest", () => {
    const hex = "00ff10a9";

    expect(decodeHex(hex)).toEqual(new Uint8Array([0x00, 0xff, 0x10, 0xa9]));
  });

  it("accepts uppercase", () => {
    expect(decodeHex("ABCD")).toEqual(new Uint8Array([0xab, 0xcd]));
  });

  it.each([
    ["odd length", "abc"],
    ["non-hex characters", "zzzz"],
    ["a whitespace-padded value", " abcd"],
  ])("rejects %s rather than decoding it to zero bytes", (_case, value) => {
    // parseInt would yield NaN, which a Uint8Array stores as 0 — turning garbage into a
    // well-formed all-zero signature.
    expect(decodeHex(value)).toBeUndefined();
  });
});

describe("byte helpers", () => {
  it("passes bytes through and encodes text", () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(toBytes(bytes)).toBe(bytes);
    expect(toBytes("hi")).toEqual(new Uint8Array([0x68, 0x69]));
  });

  it("joins parts end to end", () => {
    expect(concatBytes(encodeUtf8("a."), new Uint8Array([0x00]), encodeUtf8("b"))).toEqual(
      new Uint8Array([0x61, 0x2e, 0x00, 0x62]),
    );
  });

  it("joins nothing into nothing", () => {
    expect(concatBytes()).toEqual(new Uint8Array(0));
  });
});
