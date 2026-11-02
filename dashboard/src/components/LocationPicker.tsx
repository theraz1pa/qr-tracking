import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { DEFAULT_CENTER, createBaseMap } from "./LocationMap";

export type LatLng = { lat: number; lng: number };

type NominatimResult = { lat: string; lon: string; display_name: string; name?: string };

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Karte zum Festlegen eines Ortes: Adresse suchen (OpenStreetMap) oder direkt in die Karte klicken. */
export default function LocationPicker({
  value,
  onChange,
  onFound,
}: {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  /** Wird mit dem gefundenen Ortsnamen aufgerufen, z. B. zum Vorbelegen des Namensfelds */
  onFound?: (name: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValue = useRef(value);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = createBaseMap(containerRef.current);
    const start = initialValue.current;
    map.setView(start ? [start.lat, start.lng] : DEFAULT_CENTER, start ? 16 : 13);
    map.on("click", (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) }));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
    } else if (markerRef.current) {
      markerRef.current.setLatLng([value.lat, value.lng]);
    } else {
      markerRef.current = L.circleMarker([value.lat, value.lng], {
        radius: 10,
        color: "#1f2a44",
        weight: 3,
        fillColor: "#e06a2f",
        fillOpacity: 0.9,
      }).addTo(map);
    }
  }, [value]);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=de&q=${encodeURIComponent(q)}`,
      );
      if (!response.ok) throw new Error(`Suche fehlgeschlagen (${response.status})`);
      const [hit] = (await response.json()) as NominatimResult[];
      if (!hit) {
        setError("Nichts gefunden. Adresse genauer eingeben oder direkt in die Karte klicken.");
        return;
      }
      const found = { lat: round(Number(hit.lat)), lng: round(Number(hit.lon)) };
      onChangeRef.current(found);
      mapRef.current?.setView([found.lat, found.lng], 17);
      onFound?.(hit.name || hit.display_name.split(",").slice(0, 2).join(",").trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <input
          type="search"
          placeholder="Adresse suchen, z. B. Bodenseestraße 5, München"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <button type="button" className="btn" onClick={() => void search()} disabled={searching}>
          {searching ? "Suche …" : "Suchen"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div ref={containerRef} className="map map--picker" />
      <p className="muted small">
        {value ? "Punkt gesetzt – bei Bedarf in die Karte klicken, um ihn zu verschieben." : "In die Karte klicken, um den Ort zu setzen."}
      </p>
    </div>
  );
}
