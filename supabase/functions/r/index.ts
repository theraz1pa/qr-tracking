// Öffentlicher Redirect-Endpoint für QR-Codes:
//   GET /functions/v1/r/<slug>  →  302 auf die Ziel-URL (+ UTM-Parameter)
// Der Scan wird nach dem Response per EdgeRuntime.waitUntil in qr_scans geloggt.
// Deploy mit --no-verify-jwt (siehe supabase/config.toml).

import { createClient } from "npm:@supabase/supabase-js@2";

// Stellt die Supabase Edge Runtime global bereit.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

type DeviceType = "mobile" | "desktop" | "tablet" | "bot";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const IP_HASH_SALT = Deno.env.get("IP_HASH_SALT") ?? "";
if (!IP_HASH_SALT) {
  console.warn("IP_HASH_SALT ist nicht gesetzt – ip_hash wird leer gespeichert.");
}

const QR_PROXY_SECRET = Deno.env.get("QR_PROXY_SECRET") ?? "";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

// Link-Vorschauen, Crawler, Monitoring und HTTP-Tools. „cubot“ ist eine Smartphone-Marke.
const BOT_RE =
  /(?<!cu)bot\b|crawler|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|skypeuripreview|embedly|vkshare|curl\/|wget|httpie|python-requests|python-urllib|aiohttp|go-http-client|okhttp|java\/|libwww|axios|node-fetch|undici|postman|insomnia|headless|lighthouse|pingdom|uptime|monitor/i;
const TABLET_RE = /ipad|tablet|kindle|silk\/|playbook|android(?!.*mobile)/i;
const MOBILE_RE = /mobi|iphone|ipod|android|blackberry|bb10|opera mini|iemobile|windows phone/i;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "X-Robots-Tag": "noindex, nofollow",
};

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return textResponse(405, "Methode nicht erlaubt.", { Allow: "GET, HEAD" });
  }

  const slug = slugFromPath(new URL(req.url).pathname);
  if (!slug) return textResponse(404, "QR-Code nicht gefunden.");

  const { data: code, error } = await supabase
    .from("qr_codes")
    .select("id, target_url, active")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("qr_codes-Abfrage fehlgeschlagen:", error.message);
    return textResponse(503, "Vorübergehend nicht verfügbar. Bitte später erneut versuchen.");
  }
  if (!code || !code.active) return textResponse(404, "QR-Code nicht gefunden.");

  let location: string;
  try {
    location = withUtmParams(code.target_url, slug);
  } catch {
    console.error(`Ungültige Ziel-URL für ${slug}:`, code.target_url);
    return textResponse(500, "Die Ziel-URL dieses QR-Codes ist ungültig.");
  }

  EdgeRuntime.waitUntil(logScan(req, code.id));

  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE_HEADERS, Location: location },
  });
});

// Akzeptiert /r/<slug> und /functions/v1/r/<slug>.
function slugFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const rIndex = segments.indexOf("r");
  const slug = rIndex === -1 ? undefined : segments[rIndex + 1]?.toLowerCase();
  return slug && SLUG_RE.test(slug) ? slug : null;
}

// Vorhandene UTM-Parameter in der Ziel-URL haben Vorrang.
function withUtmParams(targetUrl: string, slug: string): string {
  const url = new URL(targetUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
  const utm = { utm_source: "fenster", utm_medium: "qr", utm_campaign: slug };
  for (const [key, value] of Object.entries(utm)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}

async function logScan(req: Request, qrCodeId: string): Promise<void> {
  try {
    const userAgent = req.headers.get("user-agent") ?? "";
    const { deviceType, isBot } = classifyUserAgent(userAgent);
    const ip = clientIp(req);

    const { error } = await supabase.from("qr_scans").insert({
      qr_code_id: qrCodeId,
      user_agent: userAgent.slice(0, 512) || null,
      device_type: deviceType,
      referrer: req.headers.get("referer")?.slice(0, 1024) || null,
      ip_hash: ip && IP_HASH_SALT ? await sha256Hex(`${IP_HASH_SALT}:${ip}`) : null,
      is_bot: isBot,
      ...clientGeo(req),
    });
    if (error) console.error("Scan konnte nicht geloggt werden:", error.message);
  } catch (err) {
    console.error("Scan konnte nicht geloggt werden:", err);
  }
}

function classifyUserAgent(userAgent: string): { deviceType: DeviceType; isBot: boolean } {
  if (!userAgent.trim() || BOT_RE.test(userAgent)) return { deviceType: "bot", isBot: true };
  if (TABLET_RE.test(userAgent)) return { deviceType: "tablet", isBot: false };
  if (MOBILE_RE.test(userAgent)) return { deviceType: "mobile", isBot: false };
  return { deviceType: "desktop", isBot: false };
}

// Über den eigenen Vercel-Proxy (qr.therapie1.com) kommen Besucher-IP und ungefährer Ort als x-client-*.
// Diesen Headern wird nur vertraut, wenn das gemeinsame Secret stimmt.
function isFromTrustedProxy(req: Request): boolean {
  return QR_PROXY_SECRET !== "" && req.headers.get("x-proxy-secret") === QR_PROXY_SECRET;
}

function clientGeo(req: Request): { country: string | null; region: string | null; city: string | null } {
  if (!isFromTrustedProxy(req)) return { country: null, region: null, city: null };
  const read = (name: string) => {
    const value = req.headers.get(name)?.trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value).slice(0, 100);
    } catch {
      return value.slice(0, 100);
    }
  };
  return { country: read("x-client-country"), region: read("x-client-region"), city: read("x-client-city") };
}

function clientIp(req: Request): string | null {
  if (isFromTrustedProxy(req)) {
    const proxied = req.headers.get("x-client-ip")?.trim();
    if (proxied) return proxied;
  }
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || null;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function textResponse(status: number, body: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { ...NO_STORE_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extraHeaders },
  });
}
