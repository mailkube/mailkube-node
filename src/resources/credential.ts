/**
 * The client's own credential, reached as `client.credential`.
 *
 * The namespace describes the API key the client was constructed with. It holds no setter: a
 * client takes its key at construction and keeps it, which is what makes one instance safe to
 * share; a second key is a second client.
 *
 * The request builder is a module-level function rather than a method, so the URL is defined
 * exactly once.
 */
import type { RequestSpec, TypedTransport } from "../transport.js";
import { decodeApiKey, type ApiKey, type RequestOptions } from "../types/index.js";

const INFO_PATH = "api-keys/me";

/**
 * Build the request describing the calling key.
 * @param options - Per-call transport options.
 * @returns The request to perform.
 */
function infoSpec(options: RequestOptions): RequestSpec {
  return { path: INFO_PATH, method: "GET", signal: options.signal };
}

/** The `client.credential` namespace. */
export class CredentialResource {
  readonly #transport: TypedTransport;

  /**
   * Bind the resource to a transport.
   * @param transport - The client, or a test double satisfying the interface.
   */
  constructor(transport: TypedTransport) {
    this.#transport = transport;
  }

  /**
   * Describe the API key this client authenticates with: its domain, organization, source-IP
   * allowlist, plan and send-quota usage.
   *
   * The key is checked exactly as a send checks it, so a key that cannot send raises an
   * `AuthenticationError` (`invalid_api_key`), which also makes this the way to verify a key. The
   * call counts as a use of the key. Plan and quota figures can be up to 30 seconds old.
   * @param options - Per-call transport options.
   * @returns The calling API key.
   */
  async info(options: RequestOptions = {}): Promise<ApiKey> {
    return this.#transport.request(infoSpec(options), decodeApiKey);
  }
}
