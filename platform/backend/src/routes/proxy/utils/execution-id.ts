import { EXECUTION_ID_HEADER } from "@shared";
import { parseMetaHeader } from "./meta-header";

/**
 * Extract the execution ID from request headers.
 * Checks X-Archestra-Execution-Id first, then falls back to the
 * second segment of X-Archestra-Meta.
 *
 * @param headers - The request headers object
 * @returns The execution ID if present, undefined otherwise
 */
export function getExecutionId(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  // Priority 1: Explicit header
  const headerKey = EXECUTION_ID_HEADER.toLowerCase();
  const headerValue = headers[headerKey];

  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  // Handle case where header might be an array (though unusual for this header)
  if (Array.isArray(headerValue) && headerValue.length > 0) {
    const firstValue = headerValue[0];
    if (typeof firstValue === "string" && firstValue.trim().length > 0) {
      return firstValue.trim();
    }
  }

  // Priority 2: Meta header fallback
  const meta = parseMetaHeader(headers);
  return meta.executionId;
}
