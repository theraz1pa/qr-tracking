-- Übersicht aller QR-Codes mit Scan-Zahlen (ohne Bots), für die Vergleichstabelle im Dashboard.
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
  last_scan_at timestamptz
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
    max(s.scanned_at)
  from public.qr_codes c
  cross join bounds b
  left join public.qr_scans s
    on s.qr_code_id = c.id
   and not s.is_bot
  group by c.id, c.slug, c.name, c.active, c.created_at, b.today_start
  order by count(s.id) desc, c.created_at;
$$;

revoke execute on function public.scan_totals_by_code() from public, anon;
grant execute on function public.scan_totals_by_code() to authenticated;
