import { createHash } from "node:crypto";
import { load } from "cheerio";
import { canonicalUrl } from "./matching";
import { publicFetch, validateRemoteUrl } from "./public-fetch";
import type { Country, Offer, Candidate } from "./types";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const isType = (value: RecordValue, type: string) =>
  array(value["@type"]).includes(type);

export type Listing = {
  name: string;
  brand: string | null;
  category: string | null;
  sku: string | null;
  productKey: string;
  description: string;
  images: string[];
  attributes: Record<string, unknown>;
  offer: Offer;
};

function nodes(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  const item = record(value);
  return Object.keys(item).length
    ? [
        item,
        ...array(item["@graph"]).flatMap(nodes),
        ...array(item.mainEntity).flatMap(nodes),
      ]
    : [];
}

function safeUrl(value: unknown, base: string): string | null {
  if (typeof value !== "string") return null;
  try {
    return validateRemoteUrl(new URL(value, base).toString()).toString();
  } catch {
    return null;
  }
}

export function parseListing(
  html: string,
  url: string,
  country: Country,
  checkedAt = new Date().toISOString(),
): Listing | null {
  const $ = load(html);
  const allNodes: RecordValue[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      allNodes.push(...nodes(JSON.parse($(element).text())));
    } catch {
      /* Ignore unrelated malformed schema blocks. */
    }
  });
  const products = allNodes.filter((item) => isType(item, "Product"));
  const matching = products.find(
    (item) =>
      safeUrl(item.url, url) &&
      canonicalUrl(safeUrl(item.url, url)!) === canonicalUrl(url),
  );
  const product = matching || (products.length === 1 ? products[0] : undefined);
  if (!product || !text(product.name)) return null;
  const offers = array(product.offers)
    .map(record)
    .filter((offer) => isType(offer, "Offer") || offer.price != null);
  const offer =
    offers.find(
      (item) =>
        safeUrl(item.url, url) &&
        canonicalUrl(safeUrl(item.url, url)!) === canonicalUrl(url),
    ) || (offers.length === 1 ? offers[0] : {});
  const availability = text(offer.availability)?.split(/[\/#]/).pop();
  const stock: Offer["stock"] =
    availability === "InStock"
      ? "in_stock"
      : ["OutOfStock", "SoldOut", "Discontinued"].includes(availability || "")
        ? "out_of_stock"
        : "unknown";
  const destinations = array(offer.shippingDetails).flatMap((details) =>
    array(record(details).shippingDestination).map((region) => ({
      region: record(region),
      blocked: record(details).doesNotShip === true,
    })),
  );
  const countryDestinations = destinations.filter(({ region: value }) => {
    const code =
      typeof value.addressCountry === "string"
        ? value.addressCountry
        : record(value.addressCountry).name;
    return code === country;
  });
  const blocked = countryDestinations.some((item) => item.blocked);
  const destination = blocked ? undefined : countryDestinations[0]?.region;
  // Only explicit destination evidence establishes country coverage. A domain or currency does not.
  const shipping: Offer["shipping"] = destination
    ? "supported"
    : destinations.length
      ? "unsupported"
      : "unknown";
  const limitations = destination
    ? [destination.addressRegion, destination.postalCode].filter(Boolean)
    : [];
  const brand = text(record(product.brand).name) || text(product.brand);
  const sku = text(product.sku) || text(product.mpn);
  const gtin =
    text(product.gtin) || text(product.gtin13) || text(product.gtin14);
  const images = array(product.image).flatMap((item) => {
    const value =
      typeof item === "string"
        ? item
        : record(item).contentUrl || record(item).url;
    const result = safeUrl(value, url);
    return result ? [result] : [];
  });
  if (!images.length) {
    const fallback = safeUrl(
      $('meta[property="og:image"]').attr("content"),
      url,
    );
    if (fallback) images.push(fallback);
  }
  // Some retailers put the current price in a UnitPriceSpecification and a
  // separate crossed-out or members-only price alongside it. Never choose the latter.
  const priceSpecifications = array(offer.priceSpecification)
    .map(record)
    .filter(
      (item) =>
        isType(item, "UnitPriceSpecification") &&
        item.price != null &&
        !item.priceType &&
        !item.validForMemberTier &&
        !item.eligibleCustomerType,
    );
  const pricedOffer =
    offer.price != null
      ? offer
      : priceSpecifications.length === 1
        ? priceSpecifications[0]
        : {};
  const rawPrice = pricedOffer.price;
  const price = rawPrice == null ? null : Number(rawPrice);
  const currency = text(pricedOffer.priceCurrency);
  const result: Listing = {
    name: text(product.name)!,
    brand,
    sku,
    category: text(product.category),
    productKey: gtin
      ? `gtin:${gtin}`
      : brand && sku
        ? `${brand.toLowerCase()}:${sku}`
        : canonicalUrl(url),
    description: text(product.description) || "",
    images: [...new Set(images)],
    attributes: Object.fromEntries(
      ["color", "material", "width", "height", "depth"].flatMap((key) =>
        product[key] ? [[key, product[key]]] : [],
      ),
    ),
    offer: {
      url,
      retailer:
        text(record(offer.seller).name) ||
        new URL(url).hostname.replace(/^www\./, ""),
      country,
      price:
        price !== null && Number.isFinite(price) && price >= 0 ? price : null,
      currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
      stock,
      shipping,
      checkedAt,
      stockEvidence: availability
        ? { url, detail: `Product offer reports ${availability}.`, checkedAt }
        : null,
      shippingEvidence: destination
        ? {
            url,
            detail: `Product shippingDestination explicitly lists ${country}.`,
            checkedAt,
          }
        : null,
      restrictions: limitations.length
        ? `Regional restriction: ${limitations.map((value) => JSON.stringify(value)).join("; ")}. Confirm your postcode with the retailer.`
        : "Country-level listing. Confirm delivery to your postcode and final price with the retailer.",
    },
  };
  return result;
}

export async function fetchListing(
  url: string,
  country: Country,
): Promise<Listing | null> {
  const response = await publicFetch(url);
  if (!response.contentType.includes("text/html")) return null;
  return parseListing(response.bytes.toString("utf8"), response.url, country);
}

export function listingCandidate(
  listing: Listing,
  source: "web" | "catalogue",
): Candidate {
  return {
    id: createHash("sha256")
      .update(canonicalUrl(listing.offer.url))
      .digest("hex")
      .slice(0, 24),
    productKey: listing.productKey,
    name: listing.name,
    brand: listing.brand,
    category: listing.category,
    imageUrl: listing.images[0] || "",
    source,
    offer: listing.offer,
  };
}
