import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { redirectUrlFor, supabase, withAuthRetry } from "../lib/supabase";
import type { QrCode } from "../lib/types";
import { isCompleteHex, normalizeHex } from "../lib/color";
import LocationPicker from "../components/LocationPicker";
import type { LatLng } from "../components/LocationPicker";
import {
  DEFAULT_DESIGN,
  PNG_SIZE_PX,
  SVG_SIZE_PX,
  blobToDataUrl,
  buildQrSvg,
  isVectorLogo,
  loadDesign,
  renderQrPng,
  saveDesign,
  svgDataUrl,
} from "../lib/qrImage";
import type { QrDesign } from "../lib/qrImage";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MAX_LOGO_BYTES = 1_000_000;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function ManageCodes() {
  const [codes, setCodes] = useState<QrCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [design, setDesign] = useState<QrDesign>(loadDesign);

  const load = useCallback(async () => {
    const { data, error } = await withAuthRetry(() => supabase.from("qr_codes").select("*").order("created_at"));
    if (error) {
      setError(error.message);
    } else {
      setCodes(data as QrCode[]);
      setError(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDesign(next: QrDesign) {
    setDesign(next);
    saveDesign(next);
  }

  return (
    <div className="stack">
      <h1>QR-Codes verwalten</h1>
      <DesignSettings design={design} onChange={updateDesign} />
      <CreateCodeForm onCreated={load} />
      {error && <p className="error">Fehler beim Laden: {error}</p>}
      {codes === null && !error && <p className="muted">Lädt …</p>}
      {codes?.length === 0 && <p className="muted">Noch keine QR-Codes angelegt.</p>}
      {codes?.map((code) => <CodeCard key={code.id} code={code} design={design} onChanged={load} />)}
    </div>
  );
}

export function DesignSettings({ design, onChange }: { design: QrDesign; onChange: (design: QrDesign) => void }) {
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => svgDataUrl(buildQrSvg(redirectUrlFor("beispiel"), design, 280)), [design]);

  function pickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
    if (!isSvg && !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setError("Bitte ein SVG-, PNG-, JPG- oder WebP-Bild wählen.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Das Logo ist zu groß (maximal 1 MB).");
      return;
    }
    // SVGs immer mit korrektem Typ einlesen – manche Systeme liefern keinen mit –, damit sie als Vektor eingebettet werden.
    const source = isSvg ? file.text().then((text) => new Blob([text], { type: "image/svg+xml" })) : Promise.resolve(file);
    void source
      .then(blobToDataUrl)
      .then((logo) => {
        setError(null);
        onChange({ ...design, logo });
      })
      .catch(() => setError("Das Logo konnte nicht gelesen werden."));
  }


  return (
    <section className="card stack">
      <div className="card-header">
        <div>
          <h2 className="m0">QR-Code-Design</h2>
          <p className="muted small">
            Gilt für alle Vorschauen und Downloads in diesem Browser. Nach jeder Änderung einmal mit dem Handy testen.
          </p>
        </div>
        <button type="button" className="btn-link small" onClick={() => onChange(DEFAULT_DESIGN)}>
          Zurücksetzen
        </button>
      </div>

      <div className="design-layout">
        <div className="setting">
          <ColorField id="qr-color" label="Farbe" value={design.color} onChange={(color) => onChange({ ...design, color })} />
          <span className="setting-hint">Dunkel wählen, damit Handys den Code sicher lesen.</span>
        </div>

        <div className="setting">
          <ColorField
            id="qr-background"
            label="Hintergrund"
            value={design.background}
            disabled={design.transparent}
            onChange={(background) => onChange({ ...design, background })}
          />
          <label className="checkbox small">
            <input
              type="checkbox"
              checked={design.transparent}
              onChange={(e) => onChange({ ...design, transparent: e.target.checked })}
            />
            Transparent
          </label>
          {design.transparent && <span className="setting-hint">Nur auf hellem Untergrund verwenden.</span>}
        </div>

        <div className="setting">
          <span className="setting-label">Logo in der Mitte</span>
          <div className="row">
            <span className="logo-thumb">
              {design.logo ? <img src={design.logo} alt="Aktuelles Logo" /> : <span className="muted small">–</span>}
            </span>
            <label className="btn">
              {design.logo ? "Ändern" : "Logo hochladen"}
              <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" hidden onChange={pickLogo} />
            </label>
            {design.logo && (
              <button type="button" className="btn" onClick={() => onChange({ ...design, logo: null })}>
                Entfernen
              </button>
            )}
          </div>
          <span className="setting-hint">
            {!design.logo
              ? "Am besten als SVG, dann bleibt es in jeder Größe scharf."
              : isVectorLogo(design.logo)
                ? "SVG-Logo: skaliert verlustfrei mit."
                : "Pixel-Logo: wird beim Vergrößern unscharf – besser ein SVG hochladen."}
          </span>
        </div>

        <figure className="design-preview-box">
          <img
            className={design.transparent ? "design-preview transparent" : "design-preview"}
            src={preview}
            alt="Vorschau des QR-Code-Designs"
          />
          <figcaption className="setting-hint">Vorschau</figcaption>
        </figure>
      </div>

      {error && <p className="error">{error}</p>}
    </section>
  );
}

// Farbwähler plus Textfeld für Hex-Codes wie #1f2a44 – beide bleiben synchron.
function ColorField({
  id,
  label,
  value,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // Nur übernehmen, wenn sich die Farbe von außen geändert hat (z. B. über den Farbwähler).
  useEffect(() => {
    setDraft((current) => (normalizeHex(current) === value ? current : value));
  }, [value]);

  const valid = normalizeHex(draft) !== null;

  return (
    <div className="field">
      <label htmlFor={`${id}-hex`}>{label}</label>
      <div className="color-input">
        <input
          type="color"
          aria-label={`${label} im Farbwähler auswählen`}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={`${id}-hex`}
          type="text"
          className={valid ? "" : "invalid"}
          aria-invalid={!valid}
          placeholder="#1f2a44"
          maxLength={7}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            if (isCompleteHex(e.target.value)) onChange(normalizeHex(e.target.value) as string);
          }}
          onBlur={() => {
            const hex = normalizeHex(draft);
            if (hex) {
              onChange(hex);
              setDraft(hex);
            } else {
              setDraft(value);
            }
          }}
        />
      </div>
      {!valid && <span className="field-error">6-stelliger Hex-Code, z. B. #1f2a44</span>}
    </div>
  );
}

function CreateCodeForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const cleanSlug = slug.trim().toLowerCase();
    const cleanUrl = targetUrl.trim();

    if (!SLUG_RE.test(cleanSlug)) {
      setError("Slug: 2–40 Zeichen, nur Kleinbuchstaben, Ziffern und Bindestriche, nicht mit Bindestrich beginnen.");
      return;
    }
    if (!name.trim()) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    if (!isHttpUrl(cleanUrl)) {
      setError("Die Ziel-URL muss mit http:// oder https:// beginnen.");
      return;
    }
    if (
      !window.confirm(
        `QR-Code „${cleanSlug}“ anlegen?\n\nDer Slug steht später in der gedruckten Adresse und kann nicht mehr geändert werden.`,
      )
    ) {
      return;
    }

    setBusy(true);
    const { error } = await withAuthRetry(() =>
      supabase.from("qr_codes").insert({ slug: cleanSlug, name: name.trim(), target_url: cleanUrl }),
    );
    setBusy(false);

    if (error) {
      setError(error.code === "23505" ? `Der Slug „${cleanSlug}“ ist bereits vergeben.` : error.message);
      return;
    }
    setSlug("");
    setName("");
    setTargetUrl("");
    await onCreated();
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Neuen QR-Code anlegen</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="new-slug">Slug</label>
          <input
            id="new-slug"
            placeholder="flyer-pasing"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="new-name">Name</label>
          <input
            id="new-name"
            placeholder="Flyer Bahnhof Pasing"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="new-target">Ziel-URL</label>
          <input
            id="new-target"
            type="url"
            placeholder="https://therapie1.com/…"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            required
          />
        </div>
        <button className="btn primary" disabled={busy}>
          {busy ? "Anlegen …" : "Anlegen"}
        </button>
      </div>
      <p className="muted small">
        Der Slug landet in der gedruckten Adresse (<code>{redirectUrlFor(slug.trim().toLowerCase() || "slug")}</code>)
        und ist danach <strong>nicht mehr änderbar</strong>. Die Ziel-URL kann jederzeit angepasst werden.
      </p>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function CodeCard({ code, design, onChanged }: { code: QrCode; design: QrDesign; onChanged: () => Promise<void> }) {
  const redirectUrl = redirectUrlFor(code.slug);
  const [targetUrl, setTargetUrl] = useState(code.target_url);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(code.name);
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [position, setPosition] = useState<LatLng | null>(null);
  const hasLocation = code.latitude !== null && code.longitude !== null;
  const preview = useMemo(() => svgDataUrl(buildQrSvg(redirectUrl, design, 320)), [redirectUrl, design]);

  useEffect(() => setTargetUrl(code.target_url), [code.target_url]);

  async function saveTarget(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanUrl = targetUrl.trim();
    if (!isHttpUrl(cleanUrl)) {
      setMessage({ kind: "error", text: "Die Ziel-URL muss mit http:// oder https:// beginnen." });
      return;
    }
    setBusy(true);
    const { error } = await withAuthRetry(() =>
      supabase.from("qr_codes").update({ target_url: cleanUrl }).eq("id", code.id),
    );
    setBusy(false);
    if (error) {
      setMessage({ kind: "error", text: error.message });
      return;
    }
    setMessage({ kind: "info", text: "Ziel-URL gespeichert. Neue Scans werden ab sofort dorthin geleitet." });
    await onChanged();
  }

  async function toggleActive() {
    if (
      code.active &&
      !window.confirm(`„${code.name}“ deaktivieren?\n\nWer den Code danach scannt, sieht nur „QR-Code nicht gefunden“.`)
    ) {
      return;
    }
    setBusy(true);
    const { error } = await withAuthRetry(() =>
      supabase.from("qr_codes").update({ active: !code.active }).eq("id", code.id),
    );
    setBusy(false);
    if (error) {
      setMessage({ kind: "error", text: error.message });
      return;
    }
    setMessage(null);
    await onChanged();
  }

  async function saveName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanName = nameDraft.trim();
    if (!cleanName) {
      setMessage({ kind: "error", text: "Der Name darf nicht leer sein." });
      return;
    }
    if (cleanName === code.name) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    const { error } = await withAuthRetry(() => supabase.from("qr_codes").update({ name: cleanName }).eq("id", code.id));
    setBusy(false);
    if (error) {
      setMessage({ kind: "error", text: error.message });
      return;
    }
    setEditingName(false);
    setMessage({ kind: "info", text: "Name gespeichert. Die Adresse im QR-Code bleibt unverändert." });
    await onChanged();
  }

  function openLocation() {
    setLocationName(code.location_name ?? "");
    setPosition(hasLocation ? { lat: code.latitude as number, lng: code.longitude as number } : null);
    setEditingLocation(true);
  }

  async function saveLocation(next: { location_name: string | null; latitude: number | null; longitude: number | null }) {
    setBusy(true);
    const { error } = await withAuthRetry(() => supabase.from("qr_codes").update(next).eq("id", code.id));
    setBusy(false);
    if (error) {
      setMessage({ kind: "error", text: error.message });
      return;
    }
    setEditingLocation(false);
    setMessage({ kind: "info", text: next.latitude === null ? "Ausgabeort entfernt." : "Ausgabeort gespeichert." });
    await onChanged();
  }

  async function copyRedirectUrl() {
    try {
      await navigator.clipboard.writeText(redirectUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ kind: "error", text: "Kopieren nicht möglich – bitte die Adresse manuell markieren." });
    }
  }

  async function download(extension: "png" | "svg") {
    try {
      const blob =
        extension === "svg"
          ? new Blob([buildQrSvg(redirectUrl, design, SVG_SIZE_PX)], { type: "image/svg+xml" })
          : await renderQrPng(redirectUrl, design, PNG_SIZE_PX);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `qr-${code.slug}.${extension}`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <article className="card code-card">
      <div className="stack">
        {editingName ? (
          <form className="row" onSubmit={saveName}>
            <input
              aria-label="Name des QR-Codes"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={80}
              autoFocus
            />
            <button className="btn primary" disabled={busy || !nameDraft.trim()}>
              Speichern
            </button>
            <button type="button" className="btn-link" onClick={() => setEditingName(false)}>
              Abbrechen
            </button>
          </form>
        ) : (
          <div className="row">
            <h2 className="m0">{code.name}</h2>
            <code>{code.slug}</code>
            <span className={code.active ? "badge ok" : "badge off"}>{code.active ? "aktiv" : "inaktiv"}</span>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setNameDraft(code.name);
                setEditingName(true);
              }}
            >
              Umbenennen
            </button>
          </div>
        )}

        <div className="field">
          <label htmlFor={`redirect-${code.id}`}>Adresse im QR-Code (nicht änderbar)</label>
          <div className="row">
            <input id={`redirect-${code.id}`} readOnly value={redirectUrl} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn" onClick={copyRedirectUrl}>
              {copied ? "Kopiert ✓" : "Kopieren"}
            </button>
          </div>
        </div>

        <form className="field" onSubmit={saveTarget}>
          <label htmlFor={`target-${code.id}`}>Ziel-URL</label>
          <div className="row">
            <input
              id={`target-${code.id}`}
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              required
            />
            <button className="btn primary" disabled={busy || targetUrl.trim() === code.target_url}>
              Speichern
            </button>
          </div>
          <span className="muted small">
            Beim Weiterleiten werden automatisch <code>utm_source=fenster</code>, <code>utm_medium=qr</code> und{" "}
            <code>utm_campaign={code.slug}</code> angehängt (außer die Ziel-URL enthält sie schon).
          </span>
        </form>

        {message && <p className={message.kind}>{message.text}</p>}

        <div className="row">
          <button type="button" className="btn" onClick={() => void download("svg")}>
            SVG (beliebig groß)
          </button>
          <button type="button" className="btn" onClick={() => void download("png")}>
            PNG (4096 px)
          </button>
          <button
            type="button"
            className={code.active ? "btn danger" : "btn"}
            onClick={toggleActive}
            disabled={busy}
          >
            {code.active ? "Deaktivieren" : "Aktivieren"}
          </button>
        </div>

        <div className="location-box stack">
          <div className="row">
            <span className="muted small">Ausgabeort:</span>
            <strong>{code.location_name ?? (hasLocation ? "auf der Karte gesetzt" : "noch keiner")}</strong>
            {!editingLocation && (
              <button type="button" className="btn-link" onClick={openLocation}>
                {hasLocation ? "Ändern" : "Ausgabeort festlegen"}
              </button>
            )}
          </div>

          {editingLocation && (
            <>
              <div className="field">
                <label htmlFor={`location-name-${code.id}`}>Name des Ortes</label>
                <input
                  id={`location-name-${code.id}`}
                  placeholder="z. B. Praxis Dr. Müller, Pasing"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                />
              </div>
              <LocationPicker
                value={position}
                onChange={setPosition}
                onFound={(name) => setLocationName((current) => current || name)}
              />
              <div className="row">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !position}
                  onClick={() =>
                    position &&
                    void saveLocation({
                      location_name: locationName.trim() || null,
                      latitude: position.lat,
                      longitude: position.lng,
                    })
                  }
                >
                  Ort speichern
                </button>
                {hasLocation && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void saveLocation({ location_name: null, latitude: null, longitude: null })}
                  >
                    Ort entfernen
                  </button>
                )}
                <button type="button" className="btn-link" onClick={() => setEditingLocation(false)}>
                  Abbrechen
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {preview && (
        <img
          className={design.transparent ? "qr-preview transparent" : "qr-preview"}
          src={preview}
          alt={`QR-Code für ${code.slug}`}
        />
      )}
    </article>
  );
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
