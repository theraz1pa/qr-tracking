import type { DeviceType } from "./types";

const numberFormat = new Intl.NumberFormat("de-DE");
const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
// Tageswerte kommen als reines Datum („2026-09-14“) – als UTC formatieren, damit nichts verrutscht.
const dayLongFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export const DEVICE_LABELS: Record<DeviceType, string> = {
  mobile: "Smartphone",
  tablet: "Tablet",
  desktop: "Desktop",
  bot: "Bot",
};

export const formatNumber = (n: number) => numberFormat.format(n);

export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

export function formatDayShort(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}.${month}.`;
}

export const formatDayLong = (day: string) => dayLongFormat.format(new Date(`${day}T00:00:00Z`));

const countryNames = new Intl.DisplayNames(["de"], { type: "region" });

export function formatCountry(code: string | null): string {
  if (!code) return "";
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function formatReferrer(referrer: string | null): string {
  if (!referrer) return "–";
  try {
    return new URL(referrer).hostname;
  } catch {
    return referrer;
  }
}
