# Übergabe: QR-Code-Tracking

Diese Datei richtet sich an die Person, die das QR-Tracking künftig betreut.
Technische Details stehen in der [README](README.md); hier geht es nur um Zugänge und Verantwortung.

## Was läuft wo

| Dienst | Was dort liegt | Adresse |
| --- | --- | --- |
| **GitHub** | dieser Quellcode | `theraz1pa/qr-tracking` (privat) |
| **Supabase** (Free) | Datenbank, Scans, Benutzer, Redirect-Function | Projekt-Ref `hnwhumtaggrhfpmwggif`, Region eu-west-1 |
| **Vercel** (Hobby) | Dashboard und Kurz-URL-Proxy | Team `therapie1`, Projekt `qr-scans` |
| **Cloudflare** | DNS-Eintrag `qr` der Domain therapie1.com | A-Record `qr` → `76.76.21.21`, Proxy **aus** |
| **Dashboard** | Oberfläche für Mitarbeiter | https://qr.therapie1.com |

Die Website therapie1.com selbst gehört **nicht** zu diesem Projekt. Sie ist nur das Ziel der Weiterleitung
und liegt in einem eigenen Repository.

## Zugänge, die übergeben werden müssen

1. **GitHub:** Mitarbeiter-Zugriff auf `theraz1pa/qr-tracking`.
2. **Supabase:** Einladung in die Organisation, die das Projekt `hnwhumtaggrhfpmwggif` enthält.
3. **Vercel:** Einladung ins Team `therapie1`.
4. **Cloudflare:** Zugriff auf die Zone therapie1.com (nur für den `qr`-Eintrag nötig).
5. **Dashboard-Login:** eigener Benutzer, angelegt über Supabase → Authentication → Users (siehe README).

## Zwei Dinge, die niemals geändert werden dürfen

- **`IP_HASH_SALT`** (Supabase-Secret). Ändert man ihn, passen alte und neue IP-Hashes nicht mehr zusammen.
  Er liegt nur in Supabase und lokal in der nicht versionierten Datei `supabase/functions/.env`.
- **Der Slug eines QR-Codes**, also die Endung in `qr.therapie1.com/<slug>`. Er steht auf gedruckten Karten
  und Postern. Die Datenbank blockiert Änderungen zusätzlich per Trigger. Das **Ziel** einer Weiterleitung
  ist dagegen jederzeit im Dashboard änderbar.

## Lokal einrichten

```bash
git clone git@github.com:theraz1pa/qr-tracking.git
cd qr-tracking
npm install
npm --prefix dashboard install
cp dashboard/.env.example dashboard/.env       # Werte aus Supabase bzw. Vercel eintragen
cp supabase/functions/.env.example supabase/functions/.env  # Werte aus den Supabase-Secrets
npm run dashboard:dev
```

Deploy des Dashboards (aus dem Ordner `dashboard`):

```bash
npx vercel deploy --prod --scope therapie1
```

Datenbank-Änderungen und Edge Function: siehe README, Abschnitt „Technik & einmalige Einrichtung“.

## Regelmäßig im Blick behalten

- **Supabase pausiert Free-Projekte** nach etwa 7 Tagen ohne Aktivität. Dann funktionieren alle gedruckten
  QR-Codes nicht mehr, bis das Projekt im Supabase-Dashboard wieder gestartet wird.
- **Vercel Hobby** ist für nicht-kommerzielle Nutzung gedacht. Für den dauerhaften geschäftlichen Betrieb
  Vercel Pro prüfen oder das Dashboard zu einem anderen Anbieter umziehen. Dank der eigenen Domain
  `qr.therapie1.com` bleiben gedruckte Codes bei einem Umzug gültig.
