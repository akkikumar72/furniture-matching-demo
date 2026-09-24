import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalUrl,
  deduplicate,
  FRESHNESS_MS,
  isPurchasable,
  validatedRanking,
} from "../src/lib/matching";
import { parseListing } from "../src/lib/listings";
import { searchSourceUrls } from "../src/lib/ai";
import {
  isPublicAddress,
  publicFetch,
  validateRemoteUrl,
} from "../src/lib/public-fetch";
import type { Candidate, Offer } from "../src/lib/types";
import { isSameOrigin } from "../src/lib/origin";

test("same-origin uploads work when Next.js reconstructs the loopback hostname", () => {
  const request = (origin: string) =>
    new Request("http://localhost:3000/api/match", {
      headers: { host: "127.0.0.1:3000", origin },
    });
  assert.equal(isSameOrigin(request("http://127.0.0.1:3000")), true);
  assert.equal(isSameOrigin(request("https://elsewhere.example")), false);
  assert.equal(isSameOrigin(request("null")), false);
});

const now = Date.parse("2026-09-23T12:00:00Z");
const timestamp = new Date(now).toISOString();
const url = "https://retailer.example/products/chair?variant=black";
const evidence = {
  url,
  detail: "Observed in product offer metadata",
  checkedAt: timestamp,
};
const offer: Offer = {
  url,
  retailer: "Example",
  country: "SE",
  price: 499,
  currency: "SEK",
  stock: "in_stock",
  shipping: "supported",
  stockEvidence: evidence,
  shippingEvidence: evidence,
  restrictions: null,
  checkedAt: timestamp,
};
const candidate: Candidate = {
  id: "a",
  productKey: "brand:black",
  name: "Black chair",
  brand: "Brand",
  category: "Chair",
  imageUrl: "https://retailer.example/black.jpg",
  source: "catalogue",
  offer,
};
const schema = (value: unknown) =>
  `<html><script type="application/ld+json">${JSON.stringify(value)}</script></html>`;
const product = {
  "@type": "Product",
  name: "Chair",
  brand: { name: "Brand" },
  sku: "black",
  image: "https://retailer.example/black.jpg",
  offers: {
    "@type": "Offer",
    url,
    price: "499",
    priceCurrency: "SEK",
    availability: "https://schema.org/InStock",
    shippingDetails: { shippingDestination: { addressCountry: "SE" } },
  },
};

test("purchase eligibility requires fresh stock AND country evidence, including on cache reads", () => {
  assert.equal(isPurchasable(offer, "SE", now), true);
  assert.equal(isPurchasable(offer, "GB", now), false);
  assert.equal(
    isPurchasable({ ...offer, stock: "out_of_stock" }, "SE", now),
    false,
  );
  assert.equal(
    isPurchasable({ ...offer, shippingEvidence: null }, "SE", now),
    false,
  );
  assert.equal(
    isPurchasable({ ...offer, shipping: "unknown" }, "SE", now),
    false,
  );
  assert.equal(isPurchasable(offer, "SE", now + FRESHNESS_MS), false);
  assert.equal(
    isPurchasable(
      { ...offer, stockEvidence: { ...evidence, checkedAt: "invalid" } },
      "SE",
      now,
    ),
    false,
  );
});
test("canonicalization removes tracking but preserves colour variants", () => {
  assert.equal(canonicalUrl(`${url}&utm_source=ad#image`), url);
  assert.notEqual(
    canonicalUrl(url),
    canonicalUrl(url.replace("black", "white")),
  );
});
test("deduplication keeps fresher negative evidence and combines source provenance", () => {
  const second: Candidate = {
    ...candidate,
    id: "b",
    source: "web",
    offer: {
      ...offer,
      checkedAt: new Date(now + 1).toISOString(),
      stock: "out_of_stock",
      url: `${url}&utm_campaign=ad`,
    },
  };
  const merged = deduplicate([candidate, second]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "both");
  assert.equal(merged[0].offer.stock, "out_of_stock");
  assert.equal(
    deduplicate([
      candidate,
      {
        ...candidate,
        id: "white",
        productKey: "brand:white",
        offer: { ...offer, url: url.replace("black", "white") },
      },
    ]).length,
    2,
  );
});
test("AI output cannot invent candidates, repeat them, or promote irrelevant images", () => {
  const result = validatedRanking(
    [
      { id: "invented", relevant: true, comparison: "Wrong ID" },
      { id: "a", relevant: false, comparison: "Unrelated" },
      {
        id: "a",
        relevant: true,
        comparison: "Similar frame, different backrest",
      },
      { id: "a", relevant: true, comparison: "Duplicate" },
    ],
    [candidate],
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ["a"],
  );
  assert.equal(result[0].offer.url, url);
});
test("listing evidence comes from a real product offer, not domain or currency", () => {
  const parsed = parseListing(schema(product), url, "SE", timestamp)!;
  assert.equal(isPurchasable(parsed.offer, "SE", now), true);
  assert.equal(parsed.offer.price, 499);
  assert.equal(parsed.productKey, "brand:black");
  const foreign = parseListing(schema(product), url, "DE", timestamp)!;
  assert.equal(foreign.offer.shipping, "unsupported");
  const noShipping = parseListing(
    schema({
      ...product,
      offers: { ...product.offers, shippingDetails: undefined },
    }),
    url,
    "SE",
    timestamp,
  )!;
  assert.equal(noShipping.offer.shipping, "unknown");
  assert.equal(isPurchasable(noShipping.offer, "SE", now), false);
});
test("ambiguous products or variant offers never borrow availability", () => {
  assert.equal(
    parseListing(
      schema([product, { ...product, name: "Other chair" }]),
      url,
      "SE",
    ),
    null,
  );
  const ambiguous = parseListing(
    schema({
      ...product,
      offers: [
        { ...product.offers, url: "https://retailer.example/products/white" },
        { ...product.offers, url: "https://retailer.example/products/red" },
      ],
    }),
    url,
    "SE",
  )!;
  assert.equal(ambiguous.offer.stock, "unknown");
  assert.equal(ambiguous.offer.price, null);
});
test("retailer price specifications exclude crossed-out and member prices", () => {
  const parsed = parseListing(
    schema({
      ...product,
      offers: {
        ...product.offers,
        price: undefined,
        priceCurrency: undefined,
        priceSpecification: [
          {
            "@type": "UnitPriceSpecification",
            price: "5249.00",
            priceCurrency: "SEK",
          },
          {
            "@type": "UnitPriceSpecification",
            price: "5595.00",
            priceCurrency: "SEK",
            priceType: "https://schema.org/StrikethroughPrice",
          },
          {
            "@type": "UnitPriceSpecification",
            price: "4999.00",
            priceCurrency: "SEK",
            validForMemberTier: "members",
          },
        ],
      },
    }),
    url,
    "SE",
  )!;
  assert.equal(parsed.offer.price, 5249);
  assert.equal(parsed.offer.currency, "SEK");
});
test("an explicit doesNotShip overrides a matching country destination", () => {
  const parsed = parseListing(
    schema({
      ...product,
      offers: {
        ...product.offers,
        shippingDetails: {
          doesNotShip: true,
          shippingDestination: { addressCountry: "SE" },
        },
      },
    }),
    url,
    "SE",
    timestamp,
  )!;
  assert.equal(parsed.offer.shipping, "unsupported");
  assert.equal(parsed.offer.shippingEvidence, null);
  assert.equal(isPurchasable(parsed.offer, "SE", now), false);
});
test("known unavailable offers stay unavailable and delivery restrictions remain visible", () => {
  const parsed = parseListing(
    schema({
      ...product,
      offers: {
        ...product.offers,
        availability: "https://schema.org/OutOfStock",
        shippingDetails: {
          shippingDestination: {
            addressCountry: "SE",
            addressRegion: "Stockholm",
          },
        },
      },
    }),
    url,
    "SE",
    timestamp,
  )!;
  assert.equal(parsed.offer.stock, "out_of_stock");
  assert.match(parsed.offer.restrictions!, /Stockholm/);
  assert.equal(isPurchasable(parsed.offer, "SE", now), false);
});
test("discovery accepts retrieved sources and citations, never prose URLs or unsafe protocols", () => {
  const urls = searchSourceUrls([
    {
      type: "message",
      content: [
        {
          text: "https://invented.example/chair",
          annotations: [{ type: "url_citation", url }],
        },
      ],
    },
    {
      type: "web_search_call",
      results: [
        { source_website_url: `${url}&utm_source=search` },
        { source_website_url: "javascript:alert(1)" },
      ],
      action: { sources: [{ url: "https://real.example/table" }] },
    },
  ]);
  assert.deepEqual(urls, [url, "https://real.example/table"]);
});
test("web discovery caps unique product URLs at eight across multiple searches", () => {
  const products = Array.from(
    { length: 12 },
    (_, index) => `https://retailer.example/product-${index}`,
  );
  const urls = searchSourceUrls([
    {
      type: "web_search_call",
      results: [
        products[0],
        `${products[0]}?utm_source=duplicate`,
        ...products.slice(1, 5),
      ].map((source_website_url) => ({ source_website_url })),
    },
    {
      type: "web_search_call",
      action: { sources: products.slice(4).map((url) => ({ url })) },
    },
  ]);
  assert.deepEqual(urls, products.slice(0, 8));
});

test("remote listing and image fetches reject private and special networks", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "0.0.0.0",
    "198.51.100.1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.throws(() => validateRemoteUrl("file:///etc/passwd"));
  assert.throws(() => validateRemoteUrl("https://user:password@example.com/"));
  assert.throws(() => validateRemoteUrl("http://example.com:3000/"));
  await assert.rejects(publicFetch("http://127.0.0.1/"), /Private network/);
});
