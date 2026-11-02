-- Erster QR-Code. Ziel-URL ist ein Platzhalter – im Dashboard unter „QR-Codes verwalten“ ändern.
insert into public.qr_codes (slug, name, target_url)
values ('fenster1', 'Schaufenster 1', 'https://example.com')
on conflict (slug) do nothing;
