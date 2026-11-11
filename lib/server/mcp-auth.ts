import { createHash, timingSafeEqual } from "node:crypto";

export type McpAuthResult =
  { ok: true } | { ok: false; status: 401 | 503; message: string };

/**
 * The MCP endpoint runs tools that bill the deployer's Bright Data account, so
 * it is off until MCP_TOKEN is set, and every request must send it as a Bearer
 * token. Compared as SHA-256 digests so the check takes the same time whatever
 * the length of the guess.
 */
export function checkMcpAuth(
  authorization: string | null,
  token: string | undefined,
): McpAuthResult {
  const expected = token?.trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      message:
        "MCP is disabled on this deploy. Set MCP_TOKEN in the server environment to enable it.",
    };
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
  const given = match?.[1]?.trim() ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!given || !timingSafeEqual(a, b)) {
    return {
      ok: false,
      status: 401,
      message:
        "Missing or wrong MCP token. Send Authorization: Bearer <MCP_TOKEN>.",
    };
  }
  return { ok: true };
}
