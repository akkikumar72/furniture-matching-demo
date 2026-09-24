import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedResult } from "../src/lib/cached-result";
import { FRESHNESS_MS } from "../src/lib/matching";
import { exampleCacheKey } from "../src/lib/example-cache";
import type { MatchResponse } from "../src/lib/types";
import {
  forgetExamplePrefetch,
  prefetchExamples,
} from "../src/lib/example-prefetch";

const recorded = async (): Promise<MatchResponse> => {
  const checkedAt = "2026-09-23T12:00:00.000Z";
  const evidence = {
    url: "https://retailer.example/chair",
    detail: "Checked listing",
    checkedAt,
  };
  return {
    country: "SE",
    cached: false,
    generatedAt: checkedAt,
    elapsedMs: 20,
    description: "Black chair",
    sources: {
      catalogue: { state: "ready", count: 3, message: "3 candidates" },
      web: { state: "ready", count: 1, message: "1 candidate" },
    },
    matches: [0, 1, 2].map((id) => ({
      id: String(id),
      productKey: String(id),
      name: "Chair",
      brand: null,
      category: "Chair",
      imageUrl: "https://retailer.example/chair.jpg",
      source: "catalogue",
      offer: {
        url: `https://retailer.example/chair-${id}`,
        retailer: "Retailer",
        country: "SE",
        price: 100,
        currency: "SEK",
        stock: "in_stock",
        shipping: "supported",
        stockEvidence: evidence,
        shippingEvidence: evidence,
        restrictions: null,
        checkedAt,
      },
    })),
    unverified: [],
  };
};

test("cached matches retain original evidence dates and expire before purchase evidence", async () => {
  const response = await recorded();
  const evidenceEnd = Math.min(
    ...response.matches.flatMap((item) =>
      [item.offer.stockEvidence!, item.offer.shippingEvidence!].map(
        (e) => Date.parse(e.checkedAt) + FRESHNESS_MS,
      ),
    ),
  );
  const now = evidenceEnd - 1000;
  const cached = cachedResult(response, "SE", now);
  assert.equal(cached.matches.length, response.matches.length);
  assert.equal(cached.cached, true);
  assert.equal(cached.generatedAt, response.generatedAt);
  assert.equal(
    cached.matches[0].offer.checkedAt,
    response.matches[0].offer.checkedAt,
  );
  assert.equal(Date.parse(cached.cacheValidUntil!), evidenceEnd);
  assert.equal(
    cachedResult(response, "SE", evidenceEnd + FRESHNESS_MS).matches.length,
    0,
  );
});

test("cached results never display wrong-country or known unavailable offers", async () => {
  const response = await recorded();
  const now = Date.parse(response.generatedAt);
  assert.equal(cachedResult(response, "DE", now).matches.length, 0);
  assert.equal(cachedResult(response, "DE", now).unverified.length, 0);
  response.matches[0].offer.stock = "out_of_stock";
  response.matches[1].offer.shipping = "unsupported";
  const result = cachedResult(response, "SE", now);
  assert.ok(
    ![...result.matches, ...result.unverified].some(
      (item) =>
        item.offer.stock === "out_of_stock" ||
        item.offer.shipping === "unsupported",
    ),
  );
});

test("example keys separate actual image, country, and model", async () => {
  const original = process.env.OPENAI_MODEL;
  try {
    process.env.OPENAI_MODEL = "cache-test-a";
    const first = await exampleCacheKey("side-table", "SE");
    assert.notEqual(first, await exampleCacheKey("side-table", "DE"));
    assert.notEqual(first, await exampleCacheKey("coffee-table", "SE"));
    process.env.OPENAI_MODEL = "cache-test-b";
    assert.notEqual(first, await exampleCacheKey("side-table", "SE"));
    await assert.rejects(exampleCacheKey("../unknown", "SE"));
  } finally {
    if (original === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = original;
  }
});

test("prefetch shares requests, separates countries, and retries expired or failed caches without live search", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  let expired = false;
  let failure = false;
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    if (failure) throw new Error("offline");
    return Response.json({
      results: {},
      expiresAt: Date.now() + (expired ? -1 : 60_000),
    });
  };
  try {
    await Promise.all([prefetchExamples("SE"), prefetchExamples("SE")]);
    await prefetchExamples("SE");
    assert.deepEqual(requests, ["/api/examples?country=SE"]);
    await prefetchExamples("DE");
    assert.equal(requests.length, 2);
    expired = true;
    await prefetchExamples("GB");
    await prefetchExamples("GB");
    assert.equal(requests.length, 4);
    failure = true;
    forgetExamplePrefetch("SE");
    const unavailable = await Promise.all([
      prefetchExamples("SE"),
      prefetchExamples("SE"),
    ]);
    assert.ok(
      unavailable.every((result) => Object.keys(result.results).length === 0),
    );
    assert.equal(requests.length, 5);
    failure = false;
    await prefetchExamples("SE");
    assert.equal(requests.length, 6);
    assert.ok(requests.every((url) => url.startsWith("/api/examples?")));
  } finally {
    globalThis.fetch = original;
    for (const country of ["SE", "DE", "GB"] as const)
      forgetExamplePrefetch(country);
  }
});
