// Kurz-URL qr.therapie1.com/<slug> → Supabase-Edge-Function „r“.
// Ein reiner Vercel-Rewrite würde die IP von Vercel statt der des Besuchers weitergeben.
// Deshalb reicht diese Funktion die Besucher-IP mit einem geheimen Header durch.
// Die Antwort (302 bzw. 404) wird unverändert zurückgegeben.

declare const process: { env: Record<string, string | undefined> };

const SUPABASE_FUNCTION_URL = "https://hnwhumtaggrhfpmwggif.supabase.co/functions/v1/r";
const GEO_HEADERS = [
  ["x-vercel-ip-country", "x-client-country"],
  ["x-vercel-ip-country-region", "x-client-region"],
  ["x-vercel-ip-city", "x-client-city"],
] as const;
const PASS_THROUGH_HEADERS =["location", "cache-control", "pragma", "expires", "content-type", "x-robots-tag", "allow"];

async function proxy(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const clientIp = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  const headers = new Headers({ "user-agent": request.headers.get("user-agent") ?? "" });
  const referer = request.headers.get("referer");
  if (referer) headers.set("referer", referer);
  if (process.env.QR_PROXY_SECRET) {
    headers.set("x-proxy-secret", process.env.QR_PROXY_SECRET);
    if (clientIp) headers.set("x-client-ip", clientIp);
    // Ungefährer Ort laut Vercel-IP-Geolokalisierung (Land, Region, Stadt – Stadt ist URL-kodiert).
    for (const [from, to] of GEO_HEADERS) {
      const value = request.headers.get(from);
      if (value) headers.set(to, value);
    }
  }

  const upstream = await fetch(`${SUPABASE_FUNCTION_URL}/${encodeURIComponent(slug)}`, {
    method: request.method,
    headers,
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  for (const name of PASS_THROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const HEAD = proxy;
