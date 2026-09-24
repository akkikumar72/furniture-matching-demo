import { FRESHNESS_MS, isPurchasable } from "./matching";
import type { Country, MatchResponse } from "./types";

/** Recheck eligibility even when no retailer or AI request is needed. */
export function cachedResult(
  result: MatchResponse,
  country: Country,
  now = Date.now(),
): MatchResponse {
  const candidates = [...result.matches, ...result.unverified].filter(
    (item) =>
      item.offer.country === country &&
      item.offer.stock !== "out_of_stock" &&
      item.offer.shipping !== "unsupported",
  );
  const matches = candidates.filter((item) =>
    isPurchasable(item.offer, country, now),
  );
  // Client and memory caches must expire before any displayed evidence does.
  const validUntil = Math.min(
    now + 5 * 60_000,
    ...matches.flatMap((item) =>
      [item.offer.stockEvidence, item.offer.shippingEvidence].map(
        (evidence) => Date.parse(evidence!.checkedAt) + FRESHNESS_MS,
      ),
    ),
  );
  return {
    ...result,
    country,
    matches: matches.slice(0, 5),
    unverified: candidates
      .filter((item) => !isPurchasable(item.offer, country, now))
      .slice(0, 5),
    cached: true,
    cacheValidUntil: new Date(validUntil).toISOString(),
  };
}
