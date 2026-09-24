import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent, fetch } from "undici";

export function validateRemoteUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("Unsupported remote URL");
  return url;
}

export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

/** Resolve once and pin the connection to that public address, including on redirects. */
export async function publicFetch(
  value: string,
  maxBytes = 2_500_000,
  redirects = 0,
): Promise<{ bytes: Buffer; url: string; contentType: string }> {
  if (redirects > 3) throw new Error("Too many redirects");
  const url = validateRemoteUrl(value);
  const records = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (
    !records.length ||
    records.some((record) => !isPublicAddress(record.address))
  )
    throw new Error("Private network URL rejected");
  const record = records[0];
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [record]);
        else callback(null, record.address, record.family);
      },
    },
  });
  try {
    const response = await fetch(url, {
      dispatcher,
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "user-agent": "FurnitureMatchingDemo/0.1 (product comparison)",
        accept: "text/html,image/*;q=0.9,*/*;q=0.5",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Redirect has no location");
      return await publicFetch(
        new URL(location, url).toString(),
        maxBytes,
        redirects + 1,
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Source returned HTTP ${response.status}`);
    }
    if (Number(response.headers.get("content-length")) > maxBytes) {
      await response.body?.cancel();
      throw new Error("Remote file is too large");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!response.body) throw new Error("Empty response");
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error("Remote file is too large");
      chunks.push(chunk);
    }
    return {
      bytes: Buffer.concat(chunks),
      url: url.toString(),
      contentType: response.headers.get("content-type") || "",
    };
  } finally {
    await dispatcher.close();
  }
}
