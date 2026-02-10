import { META_HEADER } from "@shared";

/**
 * Parsed result from the composite X-Archestra-Meta header.
 * Format: external-agent-id/execution-id/session-id
 */
export interface ParsedMetaHeader {
  externalAgentId?: string;
  executionId?: string;
  sessionId?: string;
}

/**
 * Parse the composite X-Archestra-Meta header.
 * Format: external-agent-id/execution-id/session-id
 *
 * Any segment can be empty (e.g., "/exec-123/" sets only execution-id).
 * Individual headers take precedence over meta header values — this function
 * only parses the meta header itself.
 *
 * @param headers - The request headers object
 * @returns Parsed meta header segments
 */
export function parseMetaHeader(
  headers: Record<string, string | string[] | undefined>,
): ParsedMetaHeader {
  const headerKey = META_HEADER.toLowerCase();
  const headerValue = headers[headerKey];

  let raw: string | undefined;

  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    raw = headerValue.trim();
  } else if (Array.isArray(headerValue) && headerValue.length > 0) {
    const firstValue = headerValue[0];
    if (typeof firstValue === "string" && firstValue.trim().length > 0) {
      raw = firstValue.trim();
    }
  }

  if (!raw) {
    return {};
  }

  const segments = raw.split("/");

  const externalAgentId =
    segments[0] && segments[0].trim().length > 0
      ? segments[0].trim()
      : undefined;

  const executionId =
    segments[1] && segments[1].trim().length > 0
      ? segments[1].trim()
      : undefined;

  const sessionId =
    segments[2] && segments[2].trim().length > 0
      ? segments[2].trim()
      : undefined;

  return { externalAgentId, executionId, sessionId };
}
