import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen. Lokal in dashboard/.env eintragen, auf Vercel als Environment Variables.",
  );
}

// Einladungs- und Passwort-Reset-Links landen mit #access_token=…&type=invite|recovery auf der Seite.
// Der Client entfernt das Fragment beim Start, darum vor createClient auslesen.
const authHash = new URLSearchParams(window.location.hash.slice(1));
const authType = authHash.get("type");

export const authLinkType: "invite" | "recovery" | null =
  authType === "invite" || authType === "recovery" ? authType : null;

export const authLinkError: string | null = authHash.has("error")
  ? authHash.get("error_code") === "otp_expired"
    ? "Der Link ist abgelaufen oder wurde bereits benutzt. Bitte einen neuen anfordern."
    : (authHash.get("error_description") ?? "Anmeldung über den Link fehlgeschlagen.")
  : null;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: "implicit" },
});

// Adresse, die in den QR-Code gedruckt wird. Ohne VITE_REDIRECT_BASE_URL direkt die Edge Function.
const redirectBaseUrl = (
  import.meta.env.VITE_REDIRECT_BASE_URL || `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/r`
).replace(/\/+$/, "");

export const redirectUrlFor = (slug: string) => `${redirectBaseUrl}/${slug}`;

// Direkt nach einem Token-Refresh kann die Uhr von Auth und PostgREST minimal auseinanderlaufen
// ("JWT issued at future"). Die Abfrage wird dann einmal still wiederholt.
const RETRY_DELAY_MS = 1500;

const isClockSkewError = (message: string) => /issued at future|JWT/i.test(message);

export async function withAuthRetry<T extends { error: { message: string } | null }>(
  run: () => PromiseLike<T>,
): Promise<T> {
  try {
    const result = await run();
    if (!result.error || !isClockSkewError(result.error.message)) return result;
  } catch (err) {
    if (!isClockSkewError(err instanceof Error ? err.message : String(err))) throw err;
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  return run();
}
