import { test } from "node:test";
import assert from "node:assert/strict";
import { SsrfError, assertPublicHttpUrl } from "./ssrf";

const blockedUrls = [
  // IPv4 private/reserved
  "http://0.0.0.0/",
  "http://10.0.0.1/",
  "http://100.64.0.1/",
  "http://127.0.0.1/",
  "http://127.255.255.254/",
  "http://169.254.169.254/latest/meta-data/",
  "http://172.16.0.1/",
  "http://172.31.255.255/",
  "http://192.0.0.1/",
  "http://192.0.2.1/",
  "http://192.168.1.1/",
  "http://198.18.0.1/",
  "http://198.51.100.1/",
  "http://203.0.113.1/",
  "http://224.0.0.1/",
  "http://240.0.0.1/",
  "http://255.255.255.255/",
  // Alternate IPv4 spellings (the URL parser normalizes them)
  "http://2130706433/",
  "http://0x7f000001/",
  "http://0x7f.0.0.1/",
  "http://017700000001/",
  "http://0177.0.0.1/",
  "http://127.1/",
  // IPv6 plain
  "http://[::]/",
  "http://[::1]/",
  "http://[fe80::1]/",
  "http://[fc00::1]/",
  "http://[fd12:3456::1]/",
  "http://[fec0::1]/",
  "http://[ff02::1]/",
  // IPv6 bypass forms
  "http://[::ffff:7f00:1]/",
  "http://[::ffff:a9fe:a9fe]/",
  "http://[::ffff:127.0.0.1]/",
  "http://[::ffff:169.254.169.254]/",
  "http://[::ffff:10.0.0.1]/",
  "http://[::127.0.0.1]/",
  "http://[::7f00:1]/",
  "http://[64:ff9b::7f00:1]/",
  "http://[64:ff9b::127.0.0.1]/",
  "http://[2002:7f00:1::]/",
  "http://[2002:a9fe:a9fe::1]/",
  // Hostnames
  "http://localhost/",
  "http://foo.localhost/",
  "http://metadata.google.internal/",
  "http://printer.local/",
  // Schemes
  "ftp://example.com/",
  "file:///etc/passwd",
];

for (const url of blockedUrls) {
  test(`blocks ${url}`, async () => {
    await assert.rejects(assertPublicHttpUrl(url), SsrfError);
  });
}

for (const url of [
  "http://8.8.8.8/",
  "https://1.1.1.1/path",
  "http://93.184.216.34/",
  "http://[2606:4700:4700::1111]/",
  "http://[2001:4860:4860::8888]/",
]) {
  test(`allows ${url}`, async () => {
    const parsed = await assertPublicHttpUrl(url);
    assert.equal(parsed.protocol, url.startsWith("https") ? "https:" : "http:");
  });
}

test("rejects an invalid URL", async () => {
  await assert.rejects(assertPublicHttpUrl("not a url"), SsrfError);
});
