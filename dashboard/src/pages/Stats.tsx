import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase, withAuthRetry } from "../lib/supabase";
import type { CityCount, CodeTotals, DayCount, HourCount, Kpis, QrCode, RecentScan, WeekdayCount } from "../lib/types";
import {
  DEVICE_LABELS,
  WEEKDAY_SHORT,
  formatDateTime,
  formatDayLong,
  formatDayShort,
  formatNumber,
  formatCountry,
  formatReferrer,
} from "../lib/format";
import LocationMap from "../components/LocationMap";
import type { MapPoint } from "../components/LocationMap";

// SVG-Attribute können keine CSS-Variablen auflösen, daher feste Farben (therapie1-Blau/-Orange).
const ACCENT = "#1f2a44";
const HIGHLIGHT = "#e06a2f";
const GRID = "#e4e6ec";
const AXIS_TICK = { fontSize: 12, fill: "#5f6679" };

type StatsData = {
  kpis: Kpis;
  perDay: DayCount[];
  perHour: HourCount[];
  perWeekday: WeekdayCount[];
  recent: RecentScan[];
  totals: CodeTotals[];
  cities: CityCount[];
};

export default function Stats() {
  const [codes, setCodes] = useState<QrCode[]>([]);
  const [codeId, setCodeId] = useState("");
  const [days, setDays] = useState<30 | 90>(30);
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void withAuthRetry(() => supabase.from("qr_codes").select("*").order("created_at")).then(({ data, error }) => {
      if (error) setError(error.message);
      else setCodes(data as QrCode[]);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const p_qr_code_id = codeId || null;
    setLoading(true);
    setError(null);

    const loadRecent = () => {
      let query = supabase
        .from("qr_scans")
        .select("id, scanned_at, device_type, referrer, qr_codes(name, slug)")
        .eq("is_bot", false);
      if (codeId) query = query.eq("qr_code_id", codeId);
      return query.order("scanned_at", { ascending: false }).limit(50);
    };

    void Promise.all([
      withAuthRetry(() => supabase.rpc("scan_kpis", { p_qr_code_id })),
      withAuthRetry(() => supabase.rpc("scans_per_day", { p_qr_code_id, p_days: days })),
      withAuthRetry(() => supabase.rpc("scans_per_hour", { p_qr_code_id, p_days: days })),
      withAuthRetry(() => supabase.rpc("scans_per_weekday", { p_qr_code_id, p_days: days })),
      withAuthRetry(loadRecent),
      withAuthRetry(() => supabase.rpc("scan_totals_by_code")),
      withAuthRetry(() => supabase.rpc("scans_by_city", { p_qr_code_id, p_days: days })),
    ]).then(([kpis, perDay, perHour, perWeekday, recent, totals, cities]) => {
      if (cancelled) return;
      const failed = [kpis, perDay, perHour, perWeekday, recent, totals, cities].find((r) => r.error);
      if (failed?.error) {
        setError(failed.error.message);
      } else {
        setData({
          kpis: (kpis.data as Kpis[])[0],
          perDay: perDay.data as DayCount[],
          perHour: perHour.data as HourCount[],
          perWeekday: perWeekday.data as WeekdayCount[],
          recent: recent.data as unknown as RecentScan[],
          totals: totals.data as CodeTotals[],
          cities: cities.data as CityCount[],
        });
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [codeId, days, reloadKey]);

  const selectedCode = codes.find((c) => c.id === codeId);

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="field grow">
          <label htmlFor="code-select">QR-Code</label>
          <select id="code-select" value={codeId} onChange={(e) => setCodeId(e.target.value)}>
            <option value="">Alle QR-Codes</option>
            {codes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.slug}){c.active ? "" : " – inaktiv"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="label">Zeitraum Diagramme</span>
          <div className="segmented">
            {([30, 90] as const).map((d) => (
              <button key={d} type="button" className={days === d ? "active" : ""} onClick={() => setDays(d)}>
                {d} Tage
              </button>
            ))}
          </div>
        </div>
        <button className="btn" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
          {loading ? "Lädt …" : "Aktualisieren"}
        </button>
      </div>

      {error && <p className="error">Fehler beim Laden: {error}</p>}

      {data && (
        <>
          {codeId ? (
            <div className="selected-code">
              <button type="button" className="btn" onClick={() => setCodeId("")}>
                ← Alle QR-Codes
              </button>
              <span>
                Statistik für <strong>{selectedCode?.name ?? "…"}</strong> <code>{selectedCode?.slug}</code>
              </span>
            </div>
          ) : (
            <>
              <CodeOverview totals={data.totals} onSelect={setCodeId} />
              <LocationsCard totals={data.totals} onSelect={setCodeId} />
            </>
          )}

          <KpiTiles kpis={data.kpis} />

          {data.kpis.total === 0 && (
            <p className="info">Noch keine Scans. Sobald jemand den QR-Code scannt, erscheinen hier die Zahlen.</p>
          )}

          <section className="card">
            <h2>Scans pro Tag – letzte {days} Tage</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.perDay} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="day" tickFormatter={formatDayShort} minTickGap={24} tick={AXIS_TICK} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} width={44} />
                <Tooltip labelFormatter={(label) => formatDayLong(String(label))} formatter={scansFormatter} />
                <Line type="monotone" dataKey="scans" stroke={HIGHLIGHT} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <div className="charts-2">
            <section className="card">
              <h2>Nach Uhrzeit – letzte {days} Tage</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.perHour} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="hour" tick={AXIS_TICK} interval={2} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} width={44} />
                  <Tooltip labelFormatter={(label) => `${label}:00–${label}:59 Uhr`} formatter={scansFormatter} />
                  <Bar dataKey="scans" fill={ACCENT} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="card">
              <h2>Nach Wochentag – letzte {days} Tage</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.perWeekday} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="weekday" tickFormatter={(d: number) => WEEKDAY_SHORT[d - 1]} tick={AXIS_TICK} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} width={44} />
                  <Tooltip labelFormatter={(label) => WEEKDAY_SHORT[Number(label) - 1]} formatter={scansFormatter} />
                  <Bar dataKey="scans" fill={ACCENT} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>

          <CityTable cities={data.cities} days={days} />

          <section className="card">
            <h2>Letzte 50 Scans</h2>
            {data.recent.length === 0 ? (
              <p className="muted">Keine Scans vorhanden.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeit</th>
                      {!codeId && <th>QR-Code</th>}
                      <th>Gerät</th>
                      <th>Referrer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((scan) => (
                      <tr key={scan.id}>
                        <td>{formatDateTime(scan.scanned_at)}</td>
                        {!codeId && <td>{scan.qr_codes?.name ?? "–"}</td>}
                        <td>{DEVICE_LABELS[scan.device_type]}</td>
                        <td title={scan.referrer ?? undefined}>{formatReferrer(scan.referrer)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const scansFormatter = (value: unknown) => [formatNumber(Number(value)), "Scans"] as [string, string];

function LocationsCard({ totals, onSelect }: { totals: CodeTotals[]; onSelect: (id: string) => void }) {
  const points = useMemo<MapPoint[]>(
    () =>
      totals
        .filter((t) => t.latitude !== null && t.longitude !== null)
        .map((t) => ({
          id: t.qr_code_id,
          name: t.name,
          locationName: t.location_name,
          lat: t.latitude as number,
          lng: t.longitude as number,
          total: t.total,
          last30: t.last_30_days,
        })),
    [totals],
  );

  return (
    <section className="card">
      <h2>Ausgabeorte auf der Karte</h2>
      {points.length === 0 ? (
        <p className="muted">
          Noch keine Orte hinterlegt. Unter „QR-Codes verwalten“ bei einem Code auf „Ausgabeort festlegen“ klicken.
        </p>
      ) : (
        <>
          <p className="muted small">
            Kreisgröße = Scans gesamt. Auf einen Kreis klicken, um die Zahlen und die Statistik des Codes zu sehen.
          </p>
          <LocationMap points={points} onSelect={onSelect} />
        </>
      )}
    </section>
  );
}

function CityTable({ cities, days }: { cities: CityCount[]; days: number }) {
  return (
    <section className="card">
      <h2>Scans nach Stadt – letzte {days} Tage</h2>
      <p className="muted small">
        Ungefähr, ermittelt aus der Internetverbindung. Im Mobilfunknetz steht oft die Stadt des Netzknotens statt des
        echten Orts.
      </p>
      {cities.length === 0 ? (
        <p className="muted">Noch keine Daten.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stadt</th>
                <th>Region / Land</th>
                <th className="num">Scans</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c, i) => (
                <tr key={`${c.city}-${c.region}-${c.country}-${i}`}>
                  <td>{c.city}</td>
                  <td>{[c.region, formatCountry(c.country)].filter(Boolean).join(", ") || "–"}</td>
                  <td className="num">{formatNumber(c.scans)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CodeOverview({ totals, onSelect }: { totals: CodeTotals[]; onSelect: (id: string) => void }) {
  return (
    <section className="card">
      <h2>Alle QR-Codes im Vergleich</h2>
      <p className="muted small">Auf einen Code klicken, um nur dessen Statistik zu sehen.</p>
      <div className="table-wrap">
        <table className="clickable">
          <thead>
            <tr>
              <th>QR-Code</th>
              <th className="num">Heute</th>
              <th className="num">7 Tage</th>
              <th className="num">30 Tage</th>
              <th className="num">Gesamt</th>
              <th>Letzter Scan</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr
                key={t.qr_code_id}
                tabIndex={0}
                onClick={() => onSelect(t.qr_code_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelect(t.qr_code_id);
                }}
              >
                <td>
                  <strong>{t.name}</strong> <code>{t.slug}</code>
                  {!t.active && <span className="badge off">inaktiv</span>}
                </td>
                <td className="num">{formatNumber(t.today)}</td>
                <td className="num">{formatNumber(t.last_7_days)}</td>
                <td className="num">{formatNumber(t.last_30_days)}</td>
                <td className="num">
                  <strong>{formatNumber(t.total)}</strong>
                </td>
                <td>{t.last_scan_at ? formatDateTime(t.last_scan_at) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KpiTiles({ kpis }: { kpis: Kpis }) {
  const diff = kpis.last_7_days - kpis.previous_7_days;
  let trend: string;
  if (kpis.previous_7_days === 0) {
    trend = kpis.last_7_days > 0 ? "neu" : "±0 %";
  } else {
    const pct = Math.round((diff / kpis.previous_7_days) * 100);
    trend = `${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)} %`;
  }
  const trendClass = diff > 0 ? "trend-up" : diff < 0 ? "trend-down" : "";

  return (
    <div className="tiles">
      <Tile label="Heute" value={formatNumber(kpis.today)} />
      <Tile label="Diese Woche" value={formatNumber(kpis.this_week)} hint="seit Montag" />
      <Tile label="Gesamt" value={formatNumber(kpis.total)} />
      <Tile
        label="Trend vs. Vorwoche"
        value={trend}
        valueClass={trendClass}
        hint={`${formatNumber(kpis.last_7_days)} in 7 Tagen, davor ${formatNumber(kpis.previous_7_days)}`}
      />
    </div>
  );
}

function Tile({ label, value, hint, valueClass = "" }: { label: string; value: string; hint?: string; valueClass?: string }) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value ${valueClass}`}>{value}</div>
      {hint && <div className="tile-hint">{hint}</div>}
    </div>
  );
}
