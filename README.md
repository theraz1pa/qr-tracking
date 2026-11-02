# QR-Code-Tracking

Zählt, wie oft und wann die QR-Codes von therapie1 gescannt werden: Schaufenster, Plakate, Visitenkarten usw. Läuft kostenlos auf Supabase (Free Tier), Vercel (Hobby) und Cloudflare-DNS.

```
QR-Code ──► https://qr.therapie1.com/<slug>
              │  Vercel (Projekt qr-scans): Rewrite /<slug> → api/r.ts
              │  reicht User-Agent, Referrer und Besucher-IP (mit Secret) weiter
              ▼
            Supabase Edge Function „r“: Code nachschlagen, Scan loggen
              ▼
            302 ──► Ziel-URL?utm_source=fenster&utm_medium=qr&utm_campaign=<slug>

Dashboard: https://qr.therapie1.com (Vite + React) ──► Supabase Auth + SQL-Funktionen
```

Die Edge Function ist auch direkt erreichbar (`https://hnwhumtaggrhfpmwggif.supabase.co/functions/v1/r/<slug>`). Codes mit dieser Adresse funktionieren also weiter.

| Pfad | Inhalt |
| --- | --- |
| `supabase/migrations/` | Tabellen `qr_codes` und `qr_scans`, RLS, Auswertungsfunktionen |
| `supabase/functions/r/` | Redirect-Endpoint |
| `dashboard/` | Web-App für Mitarbeiter |
| `dashboard/api/r.ts` | Vercel-Proxy für die Kurz-URL |
| `dashboard/vercel.json` | Build-Einstellungen und Rewrite `/<slug>` → Proxy |

---

## Alltag

### Neuen QR-Code anlegen

1. Unter https://qr.therapie1.com einloggen → **QR-Codes verwalten** → „Neuen QR-Code anlegen“.
2. **Slug:** die Endung der Adresse, z. B. `k1` → `qr.therapie1.com/k1`. Kurz, nur Kleinbuchstaben, Ziffern und Bindestriche. Er muss nichts über das Medium verraten. Nach dem Druck **nie ändern**, die Datenbank blockiert das auch.
3. **Name:** nur intern, z. B. „Visitenkarte Pasing“. **Ziel-URL:** wohin der Code führen soll.
4. Unter **QR-Code-Design** Farbe, Hintergrund und Logo einstellen. Das Design wird im Browser gespeichert.
5. **SVG (beliebig groß)** für Poster und Druck oder **PNG (4096 px)** herunterladen und z. B. in Canva einsetzen. Das SVG besteht nur aus einfachen Formen (kein clipPath, keine Masken), deshalb kann Canva es importieren und frei skalieren.
6. **Vor dem Druck mit dem Handy scannen:** Die Zielseite muss aufgehen, und in der Statistik muss der Scan erscheinen.

### Ausgabeort festlegen (Karte)

Für jeden Ort, an dem Karten ausliegen, einen **eigenen Code** anlegen (z. B. `karte-praxis-mueller`). Dann:
**QR-Codes verwalten** → beim Code **„Ausgabeort festlegen“** → Namen eintragen, Adresse suchen oder in die Karte klicken → **Ort speichern**.

### Statistik ansehen

- **Statistik** zeigt oben alle Codes im Vergleich: Heute, 7 Tage, 30 Tage, Gesamt und den letzten Scan.
- **Ausgabeorte auf der Karte:** jeder Code mit hinterlegtem Ort als Kreis, Größe = Scans gesamt. Ein Klick zeigt die Zahlen.
- **Scans nach Stadt:** ungefähre Stadt aus der Internetverbindung (Vercel-Geolokalisierung). Mobilfunk zeigt oft nur den Netzknoten, deshalb eignet sich diese Tabelle nicht, um Praxen in derselben Stadt zu unterscheiden. Dafür sind die Codes pro Ort da.
- Ein Klick auf eine Zeile, oder das Auswahlfeld „QR-Code“, zeigt die Details für einen einzelnen Code.
- Karten-Kacheln und Adresssuche kommen von OpenStreetMap. Beim Öffnen der Karte fragt der Browser der Mitarbeiter dort an.

### Ziel-URL ändern

**QR-Codes verwalten** → beim Code die Ziel-URL ändern → **Speichern**. Das gilt sofort, der gedruckte Code bleibt gleich.
UTM-Parameter werden automatisch angehängt. Eigene `utm_*`-Parameter in der Ziel-URL haben Vorrang, z. B. `?utm_source=visitenkarte`.

### Code deaktivieren

„Deaktivieren“ → Scans zeigen „QR-Code nicht gefunden“ (404). Codes werden nie gelöscht, damit die Statistik erhalten bleibt.

### Mitarbeiter einladen

Supabase-Dashboard → **Authentication → Users → Add user**:

- **Create new user** (empfohlen): E-Mail und ein vorläufiges Passwort eingeben, „Auto Confirm User“ anhaken. Die Person ändert das Passwort nach dem Login über „Passwort ändern“.
- **Send invitation:** Das geht nur mit eigenem SMTP (Authentication → Emails → SMTP Settings, z. B. Brevo oder Resend im Free-Plan). Der eingebaute Supabase-Mailversand stellt nur an Mitglieder der Supabase-Organisation zu.

Zugang entziehen: Nutzer in derselben Liste löschen.

---

## Technik & einmalige Einrichtung (bereits erledigt)

### Supabase

```bash
npm install
npx supabase login
npm run supabase:link
npm run db:push
```

Secrets der Edge Function stehen in `supabase/functions/.env` (nicht im Git, Vorlage: `.env.example`):

| Secret | Zweck |
| --- | --- |
| `IP_HASH_SALT` | Salt für den IP-Hash. **Nie ändern**, sonst sind alte und neue Hashes nicht vergleichbar. |
| `QR_PROXY_SECRET` | Gemeinsames Secret mit dem Vercel-Proxy. Nur wenn es stimmt, wird die weitergereichte Besucher-IP übernommen. |

```bash
npx supabase secrets set --env-file supabase/functions/.env
npm run functions:deploy
```

Auth-Einstellungen im Supabase-Dashboard:
- Sign In / Providers: „Allow new users to sign up“ **aus**.
- URL Configuration: Site URL `https://qr.therapie1.com`.

### Vercel (Team therapie1, Projekt `qr-scans`, Root Directory `dashboard`)

Environment Variables (Production):

| Variable | Wert |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://hnwhumtaggrhfpmwggif.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Publishable-Key aus Supabase → Project Settings → API Keys |
| `VITE_REDIRECT_BASE_URL` | `https://qr.therapie1.com` |
| `QR_PROXY_SECRET` | gleicher Wert wie in `supabase/functions/.env` |

Deploy aus dem Ordner `dashboard`:

```bash
npx vercel deploy --prod --scope therapie1
```

### DNS (Cloudflare, Zone therapie1.com)

`A`-Record `qr` → `76.76.21.21`, **Proxy aus („DNS only“)**. Die Nameserver bleiben bei Cloudflare, die Website ist davon nicht betroffen.

### Lokal entwickeln

Die Vorlage kopieren und die Werte eintragen:

```bash
cp dashboard/.env.example dashboard/.env
```

```bash
npm --prefix dashboard install
```

```bash
npm run dashboard:dev
```

Test ohne Dashboard:

```bash
curl -I https://qr.therapie1.com/visitenkarte
```

Erwartet: `302` mit `location: https://therapie1.com/termin?...`. curl-Aufrufe werden als Bot gespeichert und nicht gezählt.

---

## Gut zu wissen

- **Gedruckte Adressen nie ändern.** Solange die Domain therapie1.com euch gehört, lässt sich `qr.therapie1.com` bei einem Anbieterwechsel einfach umziehen. Die gedruckten Codes bleiben gültig.
- **Free-Tier-Pausierung:** Supabase pausiert Free-Projekte nach etwa 7 Tagen ohne Aktivität. Dann funktionieren die QR-Codes nicht, bis das Projekt im Supabase-Dashboard wieder gestartet wird. Regelmäßige Scans oder Dashboard-Nutzung zählen als Aktivität.
- **Vercel Hobby** ist laut Vercel-Bedingungen für nicht-kommerzielle Nutzung gedacht. Für den geschäftlichen Dauerbetrieb Vercel Pro prüfen oder das Dashboard z. B. zu Netlify umziehen. Wegen der eigenen Domain ändert sich an den gedruckten Codes dabei nichts.
- **Datenschutz:** Gespeichert werden Zeitpunkt, User-Agent, Gerätetyp, Referrer und ein gesalzener SHA-256-Hash der IP, nie die IP selbst. Keine Cookies.
- **Bots:** Link-Vorschauen (WhatsApp, Facebook, Slack …), Crawler und Tools wie curl werden mit `is_bot = true` gespeichert und in allen Auswertungen ausgeblendet.
- **Zeitzone:** Europe/Berlin. „Diese Woche“ = ab Montag, der Trend vergleicht rollierend 7×24 Stunden.
- **Geräte:** iPads melden sich wie ein Mac und erscheinen als „Desktop“.
- **Keys:** Alle `.env`-Dateien sind in `.gitignore`. Ins Dashboard gehört nur der Publishable-Key, der Service-Role-Key bleibt bei Supabase.
