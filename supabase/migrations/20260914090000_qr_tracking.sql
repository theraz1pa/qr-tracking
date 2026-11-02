-- QR-Code-Tracking: Tabellen, RLS und Auswertungsfunktionen für das Dashboard.
-- Alle Tages-, Stunden- und Wochentagsauswertungen rechnen in Europe/Berlin.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.qr_codes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              constraint qr_codes_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name        text not null
              constraint qr_codes_name_not_blank check (btrim(name) <> ''),
  target_url  text not null
              constraint qr_codes_target_url_http check (target_url ~* '^https?://[^[:space:]]+$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on column public.qr_codes.slug is
  'Steht in der gedruckten Redirect-URL – kann nach dem Anlegen nicht mehr geändert werden.';
comment on column public.qr_codes.target_url is
  'Weiterleitungsziel, jederzeit änderbar. UTM-Parameter hängt die Edge Function an.';

create table public.qr_scans (
  id           bigint generated always as identity primary key,
  qr_code_id   uuid not null references public.qr_codes (id) on delete restrict,
  scanned_at   timestamptz not null default now(),
  user_agent   text,
  device_type  text not null
               constraint qr_scans_device_type check (device_type in ('mobile', 'desktop', 'tablet', 'bot')),
  referrer     text,
  ip_hash      text,
  is_bot       boolean not null default false
);

comment on column public.qr_scans.ip_hash is
  'Gesalzener SHA-256-Hash der IP (Salt: Edge-Function-Secret IP_HASH_SALT). Nie die IP selbst.';

create index qr_scans_qr_code_id_scanned_at_idx on public.qr_scans (qr_code_id, scanned_at);
create index qr_scans_scanned_at_idx on public.qr_scans (scanned_at);

-- Der Slug ist gedruckt – Änderungen werden auch auf DB-Ebene blockiert.
create function public.qr_codes_prevent_slug_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'Der Slug eines QR-Codes kann nicht geändert werden (er ist bereits gedruckt).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger qr_codes_slug_immutable
  before update of slug on public.qr_codes
  for each row execute function public.qr_codes_prevent_slug_change();

-- ---------------------------------------------------------------------------
-- Rechte & RLS
-- anon: nichts. authenticated: qr_codes lesen/anlegen/ändern, qr_scans lesen.
-- Scans schreibt nur die Edge Function mit dem Service-Role-Key.
-- ---------------------------------------------------------------------------

alter table public.qr_codes enable row level security;
alter table public.qr_scans enable row level security;

revoke all on public.qr_codes, public.qr_scans from anon, authenticated;
grant select, insert, update on public.qr_codes to authenticated;
grant select on public.qr_scans to authenticated;
grant all on public.qr_codes, public.qr_scans to service_role;

create policy "Angemeldete lesen QR-Codes"
  on public.qr_codes for select to authenticated using (true);

create policy "Angemeldete legen QR-Codes an"
  on public.qr_codes for insert to authenticated with check (true);

create policy "Angemeldete ändern QR-Codes"
  on public.qr_codes for update to authenticated using (true) with check (true);

create policy "Angemeldete lesen Scans"
  on public.qr_scans for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Auswertungen (security invoker → RLS gilt). Bots sind immer ausgeschlossen.
-- p_qr_code_id = null bedeutet „alle Codes“.
-- ---------------------------------------------------------------------------

-- Scans pro Kalendertag, lückenlos (Tage ohne Scans = 0), inkl. heute.
create function public.scans_per_day(p_qr_code_id uuid default null, p_days integer default 30)
returns table (day date, scans bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      (now() at time zone 'Europe/Berlin')::date as today,
      least(greatest(coalesce(p_days, 30), 1), 366) as n
  ),
  counts as (
    select (s.scanned_at at time zone 'Europe/Berlin')::date as scan_day, count(*) as scan_count
    from public.qr_scans s
    cross join bounds b
    where not s.is_bot
      and (p_qr_code_id is null or s.qr_code_id = p_qr_code_id)
      and s.scanned_at >= ((b.today - (b.n - 1))::timestamp at time zone 'Europe/Berlin')
    group by 1
  )
  select (b.today - g.i) as day, coalesce(c.scan_count, 0)::bigint as scans
  from bounds b
  cross join generate_series(0, b.n - 1) as g (i)
  left join counts c on c.scan_day = b.today - g.i
  order by 1;
$$;

-- Scans pro Uhrzeit 0–23. p_days = null → gesamter Zeitraum.
create function public.scans_per_hour(p_qr_code_id uuid default null, p_days integer default null)
returns table (hour integer, scans bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select case
      when p_days is null then null
      else (((now() at time zone 'Europe/Berlin')::date - (greatest(p_days, 1) - 1))::timestamp
            at time zone 'Europe/Berlin')
    end as since
  ),
  counts as (
    select extract(hour from s.scanned_at at time zone 'Europe/Berlin')::integer as scan_hour,
           count(*) as scan_count
    from public.qr_scans s
    cross join bounds b
    where not s.is_bot
      and (p_qr_code_id is null or s.qr_code_id = p_qr_code_id)
      and (b.since is null or s.scanned_at >= b.since)
    group by 1
  )
  select g.h as hour, coalesce(c.scan_count, 0)::bigint as scans
  from generate_series(0, 23) as g (h)
  left join counts c on c.scan_hour = g.h
  order by g.h;
$$;

-- Scans pro Wochentag, ISO: 1 = Montag … 7 = Sonntag. p_days = null → gesamter Zeitraum.
create function public.scans_per_weekday(p_qr_code_id uuid default null, p_days integer default null)
returns table (weekday integer, scans bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select case
      when p_days is null then null
      else (((now() at time zone 'Europe/Berlin')::date - (greatest(p_days, 1) - 1))::timestamp
            at time zone 'Europe/Berlin')
    end as since
  ),
  counts as (
    select extract(isodow from s.scanned_at at time zone 'Europe/Berlin')::integer as scan_weekday,
           count(*) as scan_count
    from public.qr_scans s
    cross join bounds b
    where not s.is_bot
      and (p_qr_code_id is null or s.qr_code_id = p_qr_code_id)
      and (b.since is null or s.scanned_at >= b.since)
    group by 1
  )
  select g.d as weekday, coalesce(c.scan_count, 0)::bigint as scans
  from generate_series(1, 7) as g (d)
  left join counts c on c.scan_weekday = g.d
  order by g.d;
$$;

-- Kennzahlen: gesamt, heute, diese Woche (ab Montag), letzte 7 Tage vs. die 7 Tage davor (rollierend).
create function public.scan_kpis(p_qr_code_id uuid default null)
returns table (total bigint, today bigint, this_week bigint, last_7_days bigint, previous_7_days bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with local_now as (
    select (now() at time zone 'Europe/Berlin')::date as today_date
  ),
  bounds as (
    select
      (l.today_date::timestamp at time zone 'Europe/Berlin') as today_start,
      ((l.today_date - (extract(isodow from l.today_date)::integer - 1))::timestamp
        at time zone 'Europe/Berlin') as week_start
    from local_now l
  )
  select
    count(s.id)::bigint,
    count(s.id) filter (where s.scanned_at >= b.today_start)::bigint,
    count(s.id) filter (where s.scanned_at >= b.week_start)::bigint,
    count(s.id) filter (where s.scanned_at >= now() - interval '7 days')::bigint,
    count(s.id) filter (where s.scanned_at >= now() - interval '14 days'
                          and s.scanned_at < now() - interval '7 days')::bigint
  from bounds b
  left join public.qr_scans s
    on not s.is_bot
   and (p_qr_code_id is null or s.qr_code_id = p_qr_code_id)
  group by b.today_start, b.week_start;
$$;

revoke execute on function public.scans_per_day(uuid, integer) from public, anon;
revoke execute on function public.scans_per_hour(uuid, integer) from public, anon;
revoke execute on function public.scans_per_weekday(uuid, integer) from public, anon;
revoke execute on function public.scan_kpis(uuid) from public, anon;
revoke execute on function public.qr_codes_prevent_slug_change() from public, anon, authenticated;

grant execute on function public.scans_per_day(uuid, integer) to authenticated;
grant execute on function public.scans_per_hour(uuid, integer) to authenticated;
grant execute on function public.scans_per_weekday(uuid, integer) to authenticated;
grant execute on function public.scan_kpis(uuid) to authenticated;
