/**
 * The `ErrorName` catalogue guard.
 *
 * `ErrorName` must carry every name the public error reference documents, and the sibling SDKs
 * must agree — a caller branching on `ErrorName.TemplateNotFound` in TypeScript and on
 * `ErrorName.TEMPLATE_NOT_FOUND` in Python is reading the same wire value.
 *
 * The expected list below is **hand-written on purpose**. Deriving it from `ErrorName` would make
 * the test tautological, and reading it out of another repo would make it unrunnable here. A
 * dropped, misspelled or reordered member therefore fails structurally, in this repo alone.
 */
import { describe, expect, it } from "vitest";

import { ErrorName } from "../src/errors.js";

/** Every documented error-envelope `name`, in the order the reference lists them. */
const DOCUMENTED = [
  "application_error",
  "body_content_rejected",
  "browser_not_allowed",
  "concurrent_idempotent_requests",
  "from_domain_not_allowed",
  "invalid_api_key",
  "invalid_attachment",
  "invalid_from_address",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
  "invalid_request_body",
  "link_reputation_blocked",
  "max_message_size_exceeded",
  "max_recipients_exceeded",
  "method_not_allowed",
  "missing_required_field",
  "missing_required_variable",
  "missing_user_agent",
  "not_acceptable",
  "quota_exceeded",
  "rate_limit_exceeded",
  "scheduled_email_not_found",
  "scheduled_email_not_pending",
  "scheduling_not_included",
  "template_not_found",
  "template_not_published",
  "topic_disabled",
  "topic_not_found",
  "unsupported_media_type",
  "validation_error",
];

describe("ErrorName", () => {
  it("carries every documented name, and nothing undocumented", () => {
    expect(Object.values(ErrorName)).toEqual(DOCUMENTED);
  });

  it("names each member after its wire value, so the two can never drift", () => {
    for (const [member, value] of Object.entries(ErrorName)) {
      expect(member).toBe(
        value
          .split("_")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(""),
      );
    }
  });
});
