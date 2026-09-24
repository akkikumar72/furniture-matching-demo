import type { Candidate, Country, Evidence, Offer } from "./types";

export const FRESHNESS_MS = 24 * 60 * 60 * 1000;
export const CANDIDATES_PER_SOURCE = 8;

export function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

function fresh(evidence: Evidence | null, now: number) {
  if (!evidence?.url || !evidence.detail.trim()) return false;
  const age = now - Date.parse(evidence.checkedAt);
  return Number.isFinite(age) && age >= -300_000 && age < FRESHNESS_MS;
}

export function isPurchasable(
  offer: Offer,
  country: Country,
  now = Date.now(),
): boolean {
  return (
    offer.country === country &&
    offer.stock === "in_stock" &&
    offer.shipping === "supported" &&
    fresh(offer.stockEvidence, now) &&
    fresh(offer.shippingEvidence, now)
  );
}

export function deduplicate(candidates: Candidate[]): Candidate[] {
  const byUrl = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = canonicalUrl(candidate.offer.url);
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, candidate);
      continue;
    }
    const recent =
      Date.parse(candidate.offer.checkedAt) >
      Date.parse(existing.offer.checkedAt)
        ? candidate
        : existing;
    byUrl.set(key, {
      ...recent,
      id: existing.id,
      source: existing.source === candidate.source ? existing.source : "both",
      storagePath: existing.storagePath || candidate.storagePath,
    });
  }
  // Only identifiers from retailer metadata may merge variants. Similar names do not establish identity.
  const byProduct = new Map<string, Candidate>();
  for (const candidate of byUrl.values()) {
    const existing = byProduct.get(candidate.productKey);
    if (
      !existing ||
      (!isPurchasable(existing.offer, existing.offer.country) &&
        isPurchasable(candidate.offer, candidate.offer.country))
    ) {
      byProduct.set(candidate.productKey, candidate);
    }
  }
  return [...byProduct.values()];
}

export function validatedRanking(
  ranking: { id: string; comparison: string; relevant: boolean }[],
  candidates: Candidate[],
): Candidate[] {
  const lookup = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const used = new Set<string>();
  return ranking.flatMap((item) => {
    const candidate = lookup.get(item.id);
    if (!candidate || !item.relevant || used.has(item.id)) return [];
    used.add(item.id);
    return [{ ...candidate, comparison: item.comparison }];
  });
}

export async function mapLimited<T, R>(
  items: T[],
  limit: number,
  action: (item: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        output[index] = await action(items[index]);
      }
    }),
  );
  return output;
}
