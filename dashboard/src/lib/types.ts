export type DeviceType = "mobile" | "desktop" | "tablet" | "bot";

export type QrCode = {
  id: string;
  slug: string;
  name: string;
  target_url: string;
  active: boolean;
  created_at: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type Kpis = {
  total: number;
  today: number;
  this_week: number;
  last_7_days: number;
  previous_7_days: number;
};

export type DayCount = { day: string; scans: number };
export type HourCount = { hour: number; scans: number };
/** ISO-Wochentag: 1 = Montag … 7 = Sonntag */
export type WeekdayCount = { weekday: number; scans: number };

export type CodeTotals = {
  qr_code_id: string;
  slug: string;
  name: string;
  active: boolean;
  today: number;
  last_7_days: number;
  last_30_days: number;
  total: number;
  last_scan_at: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CityCount = { city: string; region: string | null; country: string | null; scans: number };

export type RecentScan = {
  id: number;
  scanned_at: string;
  device_type: DeviceType;
  referrer: string | null;
  qr_codes: { name: string; slug: string } | null;
};
