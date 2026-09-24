import type { Country, MatchResponse } from "./types";

type Prefetched = { results: Record<string, MatchResponse>; expiresAt: number };
const results = new Map<Country, Prefetched>();
const pending = new Map<Country, Promise<Prefetched>>();

/** Only reads saved results. Never calls the live matching endpoint. */
export async function prefetchExamples(country: Country): Promise<Prefetched> {
  const saved = results.get(country);
  if (saved && saved.expiresAt > Date.now()) return saved;
  const active = pending.get(country);
  if (active) return active;
  const work = (async () => {
    const response = await fetch(`/api/examples?country=${country}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error("Example cache unavailable");
    const data = (await response.json()) as Prefetched;
    results.set(country, data);
    return data;
  })().catch(() => ({ results: {}, expiresAt: 0 }));
  pending.set(country, work);
  try {
    return await work;
  } finally {
    pending.delete(country);
  }
}

export function forgetExamplePrefetch(country: Country) {
  results.delete(country);
}
