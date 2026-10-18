import { test } from "node:test";
import assert from "node:assert/strict";
import { retryAfterMs, runPool } from "./pool";

test("runPool never exceeds the limit and keeps order", async () => {
  let active = 0;
  let peak = 0;
  const res = await runPool([...Array(20).keys()], 4, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 2));
    active--;
    if (n === 7) throw new Error("boom");
    return n * 2;
  });
  assert.equal(peak, 4);
  assert.equal(res.length, 20);
  assert.deepEqual(res[3], { status: "fulfilled", value: 6 });
  assert.equal(res[7].status, "rejected");
});

test("runPool handles empty input", async () => {
  assert.deepEqual(await runPool([], 4, async () => 1), []);
});

test("retryAfterMs caps at 60s and has a fallback", () => {
  assert.equal(retryAfterMs("12"), 12000);
  assert.equal(retryAfterMs("500"), 60000);
  assert.equal(retryAfterMs(null), 5000);
  assert.equal(retryAfterMs("abc"), 5000);
});
