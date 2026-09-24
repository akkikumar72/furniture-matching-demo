import { NextResponse } from "next/server";
import { setupStatus } from "@/lib/config";
import { normalizedImage } from "@/lib/ai";
import { matchFurniture } from "@/lib/pipeline";
import { isSameOrigin } from "@/lib/origin";
import { COUNTRIES, type Country } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  const status = setupStatus();
  if (!status.ready)
    return NextResponse.json(
      {
        error: `Setup required: add ${status.missing.join(", ")} to .env.local and restart the app.`,
      },
      { status: 503 },
    );
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > 11_000_000)
    return NextResponse.json(
      { error: "Choose an image smaller than 10 MB." },
      { status: 413 },
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Send an image and a country." },
      { status: 400 },
    );
  }
  const image = form.get("image");
  const country = form.get("country");
  if (!(image instanceof File) || !image.size || image.size > 10_000_000)
    return NextResponse.json(
      { error: "Choose an image smaller than 10 MB." },
      { status: 400 },
    );
  if (typeof country !== "string" || !Object.hasOwn(COUNTRIES, country))
    return NextResponse.json(
      { error: "Select Sweden, Germany, or the United Kingdom." },
      { status: 400 },
    );
  let bytes: Buffer;
  try {
    bytes = await normalizedImage(Buffer.from(await image.arrayBuffer()));
  } catch {
    return NextResponse.json(
      { error: "The image could not be read. Use a JPEG, PNG, or WebP file." },
      { status: 400 },
    );
  }
  try {
    const result = await matchFurniture(bytes, country as Country);
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error(
      "[match failed]",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "Matching could not finish. Check the API connection and setup, then try again.",
      },
      { status: 502 },
    );
  }
}
