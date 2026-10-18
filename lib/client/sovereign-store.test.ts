import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Stub idb-keyval and the browser globals before the store loads.
const idb = new Map<string, unknown>();
const idbPath = require.resolve("idb-keyval");
require.cache[idbPath] = {
  id: idbPath,
  filename: idbPath,
  loaded: true,
  exports: {
    get: async (k: string) => idb.get(k),
    set: async (k: string, v: unknown) => void idb.set(k, v),
    del: async (k: string) => void idb.delete(k),
  },
} as unknown as NodeJS.Module;

const ls = new Map<string, string>();
(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  },
};
process.env.NEXT_PUBLIC_CLOUD_STORAGE_ENABLED = "true";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { saveSovereignValue, CloudSyncError } = require("./sovereign-store");

beforeEach(() => {
  idb.clear();
  ls.clear();
});

test("cloud failure still saves locally and throws CloudSyncError", async () => {
  globalThis.fetch = (async () =>
    new Response("{}", { status: 401 })) as typeof fetch;
  await assert.rejects(
    saveSovereignValue("k", { a: 1 }),
    (err: unknown) => err instanceof CloudSyncError,
  );
  assert.deepEqual(idb.get("k"), { a: 1 });
  assert.equal(ls.get("k"), JSON.stringify({ a: 1 }));
});

test("network error also keeps the local copy", async () => {
  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  await assert.rejects(saveSovereignValue("k2", [1]), CloudSyncError);
  assert.deepEqual(idb.get("k2"), [1]);
});

test("cloud success resolves and mirrors locally", async () => {
  let called = 0;
  globalThis.fetch = (async () => {
    called++;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  await saveSovereignValue("k3", "v");
  assert.equal(called, 1);
  assert.equal(idb.get("k3"), "v");
});
