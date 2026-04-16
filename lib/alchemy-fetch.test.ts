import test from "node:test";
import assert from "node:assert/strict";

import { fetchWithAlchemyRetry } from "@/lib/alchemy-fetch";

test("fetchWithAlchemyRetry retries 429 responses before succeeding", async () => {
  let calls = 0;
  const res = await fetchWithAlchemyRetry("https://example.com", undefined, {
    retries: 2,
    baseDelayMs: 1,
    jitterMs: 0,
    fetchImpl: async () => {
      calls++;
      if (calls < 3) {
        return new Response("rate limited", { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    sleepImpl: async () => {},
  });

  assert.equal(calls, 3);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("fetchWithAlchemyRetry stops after retry budget is exhausted", async () => {
  let calls = 0;
  const res = await fetchWithAlchemyRetry("https://example.com", undefined, {
    retries: 2,
    baseDelayMs: 1,
    jitterMs: 0,
    fetchImpl: async () => {
      calls++;
      return new Response("rate limited", { status: 429 });
    },
    sleepImpl: async () => {},
  });

  assert.equal(calls, 3);
  assert.equal(res.status, 429);
});
