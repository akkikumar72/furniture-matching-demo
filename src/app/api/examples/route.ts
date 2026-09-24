import { NextResponse } from "next/server";
import { cachedExamples } from "@/lib/example-cache";
import { COUNTRIES, type Country } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const country = new URL(request.url).searchParams.get("country");
  if (!country || !Object.hasOwn(COUNTRIES, country)) {
    return NextResponse.json(
      { error: "Select a supported country." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await cachedExamples(country as Country), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Example cache unavailable." },
      { status: 503 },
    );
  }
}
