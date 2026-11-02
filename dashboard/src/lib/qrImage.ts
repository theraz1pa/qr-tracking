import QRCode from "qrcode";

// Eigener, bewusst schlichter SVG-Aufbau: nur viewBox, Rechtecke und optional das Logo.
// Keine clipPath/Masken – sonst lehnen Canva & Co. die Datei ab, und das SVG soll für Poster frei skalierbar sein.

export type QrDesign = {
  color: string;
  background: string;
  /** true = kein Hintergrund (SVG ohne Hintergrundfläche, PNG mit Alphakanal) */
  transparent: boolean;
  /** Logo als Data-URL, null = ohne Logo */
  logo: string | null;
};

// therapie1-Blau auf Weiß
export const DEFAULT_DESIGN: QrDesign = { color: "#1f2a44", background: "#ffffff", transparent: false, logo: null };

/** SVG-Logos werden als Vektor eingebettet und skalieren verlustfrei mit. */
export const isVectorLogo = (dataUrl: string) => dataUrl.startsWith("data:image/svg+xml");

/** Nennmaß des SVG. Groß gewählt, weil Canva SVGs beim PNG-Export teils in dieser Größe rastert. */
export const SVG_SIZE_PX = 4096;
/** PNG groß genug für Poster */
export const PNG_SIZE_PX = 4096;

const QUIET_ZONE = 4; // Ruhezone in Modulen, Standard laut QR-Spezifikation
const FINDER = 7;
const LOGO_SHARE = 0.24; // Anteil der Kantenlänge, den das Logo belegt (mit Fehlerkorrektur H unkritisch)

const DESIGN_STORAGE_KEY = "qr-design";

export function loadDesign(): QrDesign {
  try {
    const raw = localStorage.getItem(DESIGN_STORAGE_KEY);
    return raw ? { ...DEFAULT_DESIGN, ...(JSON.parse(raw) as Partial<QrDesign>) } : DEFAULT_DESIGN;
  } catch {
    return DEFAULT_DESIGN;
  }
}

export function saveDesign(design: QrDesign) {
  try {
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(design));
  } catch {
    // Speicher voll oder blockiert – das Design gilt dann nur bis zum Neuladen.
  }
}

const num = (value: number) => Number(value.toFixed(3));
const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function buildQrSvg(data: string, design: QrDesign, sizePx: number): string {
  const qr = QRCode.create(data, { errorCorrectionLevel: design.logo ? "H" : "Q" });
  const n = qr.modules.size;
  const total = n + QUIET_ZONE * 2;
  const color = attr(design.color);

  const isFinder = (r: number, c: number) =>
    (r < FINDER && c < FINDER) || (r < FINDER && c >= n - FINDER) || (r >= n - FINDER && c < FINDER);

  // Logo-Feld mittig, plus ein Modul Abstand ringsum frei.
  const logoSize = design.logo ? Math.round(n * LOGO_SHARE) : 0;
  const logoStart = Math.floor((n - logoSize) / 2);
  const inLogoArea = (r: number, c: number) =>
    logoSize > 0 &&
    r >= logoStart - 1 &&
    r < logoStart + logoSize + 1 &&
    c >= logoStart - 1 &&
    c < logoStart + logoSize + 1;

  // Alle Punkte und Augen als je EIN Pfad: wenige Elemente, damit Grafikprogramme das SVG als Vektor behandeln.
  let dots = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isFinder(r, c) || inLogoArea(r, c) || !qr.modules.get(r, c)) continue;
      dots += roundedRect(c + QUIET_ZONE + 0.06, r + QUIET_ZONE + 0.06, 0.88, 0.88, 0.3);
    }
  }

  let finderRings = "";
  let finderCenters = "";
  for (const [r, c] of [
    [0, 0],
    [0, n - FINDER],
    [n - FINDER, 0],
  ]) {
    const x = c + QUIET_ZONE;
    const y = r + QUIET_ZONE;
    finderRings += roundedRect(x, y, 7, 7, 2.1) + roundedRect(x + 1, y + 1, 5, 5, 1.1);
    finderCenters += roundedRect(x + 2, y + 2, 3, 3, 0.8);
  }

  const logo = design.logo ? logoMarkup(design.logo, logoStart + QUIET_ZONE, logoSize) : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${total} ${total}">` +
    (design.transparent ? "" : `<rect width="${total}" height="${total}" fill="${attr(design.background)}"/>`) +
    `<path fill="${color}" fill-rule="evenodd" d="${finderRings}"/>` +
    `<path fill="${color}" d="${finderCenters}${dots}"/>` +
    logo +
    `</svg>`
  );
}

function roundedRect(x: number, y: number, w: number, h: number, radius: number): string {
  const r = num(radius);
  const hw = num(w - 2 * radius);
  const hh = num(h - 2 * radius);
  return (
    `M${num(x + radius)} ${num(y)}h${hw}a${r} ${r} 0 0 1 ${r} ${r}v${hh}` +
    `a${r} ${r} 0 0 1 -${r} ${r}h-${hw}a${r} ${r} 0 0 1 -${r} -${r}v-${hh}a${r} ${r} 0 0 1 ${r} -${r}z`
  );
}

// SVG-Logos werden als Vektorgruppe eingebettet (skaliert mit), Pixel-Logos als <image>.
function logoMarkup(dataUrl: string, position: number, size: number): string {
  const [header, payload = ""] = dataUrl.split(",", 2);
  if (header.startsWith("data:image/svg+xml")) {
    const text = header.includes(";base64")
      ? new TextDecoder().decode(Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0)))
      : decodeURIComponent(payload);
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const root = doc.documentElement;
    if (root.nodeName.toLowerCase() === "svg" && !doc.querySelector("parsererror")) {
      // Aktive Inhalte aus hochgeladenen Logos entfernen.
      doc.querySelectorAll("script, foreignObject").forEach((el) => el.remove());
      doc.querySelectorAll("*").forEach((el) => {
        for (const a of [...el.attributes]) if (a.name.toLowerCase().startsWith("on")) el.removeAttribute(a.name);
      });
      const [minX, minY, vbWidth, vbHeight] = (
        root.getAttribute("viewBox") ??
        `0 0 ${parseFloat(root.getAttribute("width") ?? "100")} ${parseFloat(root.getAttribute("height") ?? "100")}`
      )
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      // Statt verschachteltem <svg> eine transformierte Gruppe – das verstehen mehr Programme.
      const scale = size / Math.max(vbWidth, vbHeight);
      const tx = position + (size - vbWidth * scale) / 2 - minX * scale;
      const ty = position + (size - vbHeight * scale) / 2 - minY * scale;
      const serializer = new XMLSerializer();
      const inner = [...root.childNodes].map((node) => serializer.serializeToString(node)).join("");
      return `<g transform="matrix(${num(scale)} 0 0 ${num(scale)} ${num(tx)} ${num(ty)})">${inner}</g>`;
    }
  }
  return `<image x="${position}" y="${position}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" href="${attr(dataUrl)}"/>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export async function renderQrPng(data: string, design: QrDesign, sizePx: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([buildQrSvg(data, design, sizePx)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("QR-Code konnte nicht gezeichnet werden."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("QR-Code konnte nicht gezeichnet werden.");
    ctx.drawImage(img, 0, 0, sizePx, sizePx);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG konnte nicht erzeugt werden."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
