/** "#1f2a44", "1F2A44" oder Kurzform "#fff" → "#1f2a44" bzw. "#ffffff"; alles andere → null. */
export function normalizeHex(input: string): string | null {
  const hex = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${[...hex].map((ch) => ch + ch).join("")}`;
  return null;
}

/** Nur vollständige 6-stellige Codes – beim Tippen wird "1f2" sonst schon als #11ff22 übernommen. */
export const isCompleteHex = (input: string) => /^#?[0-9a-f]{6}$/i.test(input.trim());
