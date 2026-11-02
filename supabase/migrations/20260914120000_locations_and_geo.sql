-- Ausgabeort pro QR-Code (für die Karte) und ungefährer Scan-Ort laut IP-Geolokalisierung.

alter table public.qr_codes
  add column location_name text,
  add column latitude double precision
    constraint qr_codes_latitude_range check (latitude between -90 and 90),
  add column longitude double precision
    constraint qr_codes_longitude_range check (longitude between -180 and 180),
  add constraint qr_codes_location_pair check ((latitude is null) = (longitude is null));

comment on column public.qr_codes.location_name is 'Wo der Code ausliegt/hängt, z. B. „Praxis Dr. Müller, Pasing“.';

alter table public.qr_scans
  add column country text,
  add column region text,
  add column city text;

comment on column public.qr_scans.city is
  'Ungefähre Stadt laut IP-Geolokalisierung (Vercel). Keine genaue Position, keine IP.';

-- Rückgabetyp ändert sich → neu anlegen.
drop function public.scan_totals_by_code();

create function public.scan_totals_by_code()
returns table (
  qr_code_id uuid,
  slug text,
  name text,
  active boolean,
  today bigint,
  last_7_days bigint,
  last_30_days bigint,
  total bigint,
  last_scan_at timestamptz,
  location_name text,
  latitude double precision,
  longitude double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select ((now() at time zone 'Europe/Berlin')::date)::timestamp at time zone 'Europe/Berlin' as today_start
  )
  select
    c.id,
    c.slug,
    c.name,
    c.active,
    count(s.id) filter (where s.scanned_at >= b.today_start)::bigint,
    count(s.id) filter (where s.scanned_at >= now() - interval '7 days')::bigint,
    count(s.id) filter (where s.scanned_at >= now() - interval '30 days')::bigint,
    count(s.id)::bigint,
    max(s.scanned_at),
    c.location_name,
    c.latitude,
    c.longitude
  from public.qr_codes c
  cross join bounds b
  left join public.qr_scans s
    on s.qr_code_id = c.id
   and not s.is_bot
  group by c.id, c.slug, c.name, c.active, c.created_at, c.location_name, c.latitude, c.longitude, b.today_start
  order by count(s.id) desc, c.created_at;
$$;

-- Scans nach (ungefährer) Stadt. p_days = null → gesamter Zeitraum.
create function public.scans_by_city(p_qr_code_id uuid default null, p_days integer default null)
returns table (city text, region text, country text, scans bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(s.city, 'Unbekannt'),
    s.region,
    s.country,
    count(*)::bigint
  from public.qr_scans s
  where not s.is_bot
    and (p_qr_code_id is null or s.qr_code_id = p_qr_code_id)
    and (
      p_days is null
      or s.scanned_at >= (((now() at time zone 'Europe/Berlin')::date - (greatest(p_days, 1) - 1))::timestamp
                          at time zone 'Europe/Berlin')
    )
  group by 1, 2, 3
  order by 4 desc
  limit 50;
$$;

revoke execute on function public.scan_totals_by_code() from public, anon;
revoke execute on function public.scans_by_city(uuid, integer) from public, anon;
grant execute on function public.scan_totals_by_code() to authenticated;
grant execute on function public.scans_by_city(uuid, integer) to authenticated;
