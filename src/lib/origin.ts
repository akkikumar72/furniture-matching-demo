export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    // Next.js can reconstruct request.url with localhost while the browser uses 127.0.0.1.
    const host = request.headers.get("host") || target.host;
    return source.host === host && source.protocol === target.protocol;
  } catch {
    return false;
  }
}
