import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatNumber } from "../lib/format";

export type MapPoint = {
  id: string;
  name: string;
  locationName: string | null;
  lat: number;
  lng: number;
  total: number;
  last30: number;
};

const NAVY = "#1f2a44";
const ORANGE = "#e06a2f";

/** Startansicht ohne gespeicherte Orte: München-Pasing */
export const DEFAULT_CENTER: L.LatLngTuple = [48.1397, 11.4591];

export function createBaseMap(element: HTMLElement): L.Map {
  const map = L.map(element, { scrollWheelZoom: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

export default function LocationMap({ points, onSelect }: { points: MapPoint[]; onSelect: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = createBaseMap(containerRef.current);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const maxTotal = Math.max(1, ...points.map((p) => p.total));

    for (const point of points) {
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: 8 + 22 * Math.sqrt(point.total / maxTotal),
        color: NAVY,
        weight: 2,
        fillColor: ORANGE,
        fillOpacity: 0.75,
      });

      // Namen stammen aus Nutzereingaben → als Text einfügen, nicht als HTML.
      const tooltip = document.createElement("span");
      tooltip.textContent = `${point.name}: ${formatNumber(point.total)} Scans`;
      marker.bindTooltip(tooltip);

      const popup = document.createElement("div");
      popup.className = "map-popup";
      const title = document.createElement("strong");
      title.textContent = point.name;
      popup.append(title);
      if (point.locationName) {
        const place = document.createElement("div");
        place.textContent = point.locationName;
        popup.append(place);
      }
      const numbers = document.createElement("div");
      numbers.textContent = `${formatNumber(point.last30)} Scans in 30 Tagen · ${formatNumber(point.total)} gesamt`;
      popup.append(numbers);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn small";
      button.textContent = "Statistik ansehen";
      button.addEventListener("click", () => onSelectRef.current(point.id));
      popup.append(button);
      marker.bindPopup(popup);

      marker.addTo(layer);
    }

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)), {
        padding: [40, 40],
        maxZoom: 16,
      });
    } else {
      map.setView(DEFAULT_CENTER, 13);
    }
  }, [points]);

  return <div ref={containerRef} className="map" />;
}
