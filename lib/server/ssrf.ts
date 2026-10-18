import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for routes that fetch user-supplied URLs server-side.
 *
 * Rejects anything that isn't a public http(s) endpoint: non-http schemes,
 * IP literals in private/reserved ranges, and hostnames that resolve to them.
 * This blocks cloud metadata endpoints (169.254.169.254), localhost, and
 * RFC1918 / link-local / unique-local addresses.
 */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

// Separate lists: node matches IPv4 addresses against IPv6 rules as mapped
// addresses, so a shared list would block every public IPv4.
const blockedV4 = new net.BlockList();
const blockedV6 = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata)
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved (incl. 255.255.255.255)
] as const)
  blockedV4.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["::ffff:0:0", 96], // IPv4-mapped
  ["::", 96], // IPv4-compatible
  ["64:ff9b::", 96], // NAT64
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique-local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const)
  blockedV6.addSubnet(addr, prefix, "ipv6");

/** Expand an IPv6 literal to 8 16-bit groups, or null if it can't be parsed. */
function expandV6(ip: string): number[] | null {
  let canon: string;
  try {
    // The URL parser rewrites dotted-quad tails (::ffff:1.2.3.4) as hex groups.
    canon = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const [head, tail] = canon.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = canon.includes("::") ? 8 - h.length - t.length : 0;
  if (fill < 0) return null;
  const groups = [...h, ...Array<string>(fill).fill("0"), ...t].map((g) =>
    parseInt(g, 16),
  );
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff)
    ? groups
    : null;
}

const v4From = (hi: number, lo: number) =>
  `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return blockedV4.check(ip, "ipv4");

  if (net.isIPv6(ip)) {
    const addr = ip.split("%")[0]; // drop zone id
    if (blockedV6.check(addr, "ipv6")) return true;
    const g = expandV6(addr);
    if (!g) return true; // unparseable — fail closed
    // Re-check any embedded IPv4: mapped/compatible, NAT64, 6to4.
    const low96Zero = g.slice(0, 5).every((x) => x === 0);
    if (low96Zero && (g[5] === 0xffff || g[5] === 0))
      return blockedV4.check(v4From(g[6], g[7]), "ipv4");
    if (g[0] === 0x64 && g[1] === 0xff9b)
      return blockedV4.check(v4From(g[6], g[7]), "ipv4");
    if (g[0] === 0x2002) return blockedV4.check(v4From(g[1], g[2]), "ipv4");
    return false;
  }

  return true; // unknown family — fail closed
}

/**
 * Validate that `raw` is a public http(s) URL and return the parsed URL.
 * Throws {@link SsrfError} for anything unsafe.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("Invalid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Only http and https URLs are allowed.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // Literal IP address — check directly, no DNS.
  if (net.isIP(host)) {
    if (isPrivateIp(host))
      throw new SsrfError("URL points to a private or reserved address.");
    return url;
  }

  // Obvious local hostnames.
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new SsrfError("URL points to a private host.");
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new SsrfError("Could not resolve host.");
  }
  if (resolved.length === 0) throw new SsrfError("Could not resolve host.");
  for (const { address } of resolved) {
    if (isPrivateIp(address))
      throw new SsrfError("URL resolves to a private or reserved address.");
  }

  return url;
}
