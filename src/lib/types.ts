export const COUNTRIES = {
  SE: { name: "Sweden", currency: "SEK", language: "Swedish" },
  DE: { name: "Germany", currency: "EUR", language: "German" },
  GB: { name: "United Kingdom", currency: "GBP", language: "English" },
} as const;
export type Country = keyof typeof COUNTRIES;
export type Source = "catalogue" | "web" | "both";
export type Evidence = { url: string; detail: string; checkedAt: string };
export type Offer = {
  url: string;
  retailer: string;
  country: Country;
  price: number | null;
  currency: string | null;
  stock: "in_stock" | "out_of_stock" | "unknown";
  shipping: "supported" | "unsupported" | "unknown";
  stockEvidence: Evidence | null;
  shippingEvidence: Evidence | null;
  restrictions: string | null;
  checkedAt: string;
};
export type Candidate = {
  id: string;
  productKey: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string;
  storagePath?: string;
  source: Source;
  offer: Offer;
  similarity?: number;
  comparison?: string;
};
export type SourceStatus = {
  state: "ready" | "partial" | "unavailable";
  message: string;
  count: number;
};
export type MatchResponse = {
  matches: Candidate[];
  unverified: Candidate[];
  description: string;
  sources: { catalogue: SourceStatus; web: SourceStatus };
  cached: boolean;
  cacheValidUntil?: string;
  generatedAt: string;
  elapsedMs: number;
  country: Country;
};
export type SetupStatus = { ready: boolean; missing: string[] };
export const EXAMPLES = [
  { file: "side-table", name: "Side table", image: "/examples/side-table.png" },
  { file: "poster", name: "Framed poster", image: "/examples/poster.png" },
  {
    file: "wooden-chair",
    name: "Wooden chair",
    image: "/examples/wooden-chair.png",
  },
  {
    file: "coffee-table",
    name: "Coffee table",
    image: "/examples/coffee-table.png",
  },
  {
    file: "green-chair",
    name: "Green chair",
    image: "/examples/green-chair.png",
  },
  {
    file: "cantilever-chair",
    name: "Cantilever chair",
    image: "/examples/cantilever-chair.png",
  },
] as const;
