# Appilot Studio

Autorentool für Klickanleitungen, Schulungsvideos und Lernstrecken zu beliebigen Web-Anwendungen, mit Appilot als
KI-Hilfe. Arbeitstitel.

**Ziel:** vorführbarer MVP zur LEARNTEC Anfang Februar 2027.

## Was das Studio kann

- **Cases:** Arbeitsabläufe in der Zielanwendung, Schritt für Schritt. Entstehen aus einer Beschreibung (KI-Entwurf),
  durch Aufnehmen in der Anwendung oder von Hand mit Bildschirmfotos. Probelauf, Prüfung und Freigabe.
- **Medien:** Erklärvideo mit Sprecher und Klickanleitung aus einem Case. Beides steht im Case unter „Video und
  Klickanleitung“; die Übersicht **Medien** zeigt eine Karte je Case bzw. Lernstrecke mit Filtern (Cases, Lernstrecken,
  veraltet, Video fehlt) und Suche. **Notizen für Appilot** (Hausregeln, interne Vorgaben) stehen getrennt daneben,
  Neuigkeiten nach einem Update nur unter „Updates“.
- **Lernstrecken:** interaktive Einheiten aus Szenario, Erklärung, Übungen, Praxis in der Anwendung und Spickzettel.
  KI-Entwurf, Tutor beim Lernen, Export als SCORM-Paket.
- **Sprachfassungen:** Übersetzung von Cases und Lernstrecken.
- **Update-Check:** Ändert sich die Zielanwendung, erkennt das Studio, welche Cases und Lernstrecken betroffen sind,
  schlägt Änderungen vor und führt sie nach Bestätigung durch.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `start.html`, `lib/start.js` | Startseite: Erste Schritte und „Meine Aufgaben“ |
| `lib/nav.js` | gemeinsame Navigation (Seitenleiste), Projekt-Dialog |
| `editor.html`, `lib/editor.js` | Case-Editor mit Wissensbasis und Update-Check |
| `lern-editor.html`, `lib/lern-editor.js` | Lern-Editor für Lernstrecken |
| `lernen.html`, `lib/lernen.js` | Lernansicht und Tutor |
| `lib/` | gemeinsame Bausteine: Projekt, Speicher, Zielanwendung, Medien, Kurs, SCORM, Sprachen, Update-Check |
| `anmelden.html`, `lib/anmelden.js`, `lib/auth.js` | Anmeldung und Schutz der Studio-Seiten |
| `api/` | Serverfunktionen: Anmeldung, Appilot (KI) und Sprecher (Text zu Sprache); `api/_lib/` gemeinsamer Servercode |
| `extension/` | Browser-Erweiterung „Appilot-Aufnahme“ (eigene Anleitung in `extension/README.md`) |
| `scripts/admin.mjs` | Nutzer anlegen bzw. neuen Einladungslink erzeugen (nur lokal) |
| `vendor/` | eingebundene Bibliotheken mit Lizenz |
| `server.mjs` | lokaler Server |

## Starten

```bash
npm install
node server.mjs
```

Danach läuft das Studio auf http://localhost:3000. Für die Anmeldung braucht es `DATABASE_URL`, für die KI
`ANTHROPIC_API_KEY`, für den Sprecher `ELEVENLABS_API_KEY`, jeweils in der Umgebung oder in `.env`.

## Auf Vercel

Vercel-Projekt `appilotstudio`, verbunden mit diesem Repo: `main` geht in Production, jeder Branch bekommt ein
Vorschau-Deployment. Umgebungsvariablen (Settings → Environment Variables), jeweils für **Production und Preview**:

| Variable | Wofür |
| --- | --- |
| `DATABASE_URL` | Datenbank (Neon Postgres, Frankfurt); setzt die Neon-Integration von selbst |
| `ANTHROPIC_API_KEY` | KI-Entwurf, Texte, Lernstrecken, Tutor, Sprachfassungen |
| `ELEVENLABS_API_KEY` | Sprecher in Videos und beim Vorlesen |
| `ELEVENLABS_VOICE_ID` | optional, andere Stimme |
| `APPILOT_MODEL` | optional, anderes Claude-Modell |

Fehlt ein Schlüssel, läuft das Studio weiter; Videos entstehen dann ohne Ton, die KI meldet sich als nicht erreichbar.

## Anmeldung

Nur angemeldete Nutzer kommen ins Studio; `/api/appilot` und `/api/tts` antworten ohne Anmeldung mit 401.
Es gibt keine Selbstregistrierung: Ein Admin legt Nutzer an und gibt ihnen einen Einladungslink, über den sie ihr
Passwort festlegen. Den ersten Admin (und bis zur Nutzerverwaltung jeden weiteren Nutzer) legt das Skript an:

```bash
APP_URL=https://<adresse-des-studios> node scripts/admin.mjs name@firma.de "Vorname Nachname" admin
```

Rollen: `admin`, `autor`, `pruefer`. Gibt es die E-Mail schon, entsteht nur ein neuer Link (so lässt sich auch ein
vergessenes Passwort zurücksetzen). Der Link gilt 7 Tage und nur einmal.

| Thema | Umsetzung |
| --- | --- |
| Passwörter | mindestens 12 Zeichen, `scrypt` aus `node:crypto` mit zufälligem Salz |
| Sitzung | zufälliges Token im Cookie `appilot_session` (`HttpOnly`, `SameSite=Lax`, `Secure` bei HTTPS), 12 Stunden; in der Datenbank nur der SHA-256-Hash |
| Einladung | einmaliger Link, 7 Tage, nur als Hash gespeichert; beim Festlegen enden alle alten Sitzungen |
| Fehlversuche | nach 5 falschen Passwörtern ist das Konto 15 Minuten gesperrt; gleiche Meldung für unbekannte E-Mails |
| Fremde Seiten | schreibende Anfragen mit fremdem `Origin` werden abgelehnt |

Die Tabellen `users`, `sessions` und `invites` legt der Server beim ersten Zugriff selbst an (`api/_lib/db.js`).
Abhängigkeit: [`postgres`](https://github.com/porsager/postgres) (postgres.js, Unlicense, ohne weitere Abhängigkeiten).

## Navigation und Adressen

Start, Case-Editor und Lern-Editor haben links dieselbe Navigation (`lib/nav.js`), auf schmalen Fenstern oben. Darunter
stehen das Projekt und der angemeldete Nutzer. Die Lernansicht hat bewusst keine Seitenleiste, weil sie zeigt, was
Lernende sehen.

| Adresse | Inhalt |
| --- | --- |
| `/` oder `/start` | Startseite: Erste Schritte (bis alles einmal erledigt ist), Überblick, „Meine Aufgaben“ |
| `/editor#cases`, `#medien`, `#notizen`, `#updates` | Cases, Medien (Videos und Klickanleitungen), Notizen für Appilot, Updates |
| `/editor#medien=<caseId>` | Case beim Abschnitt „Video und Klickanleitung“ öffnen |
| `/editor#neu`, `/lern-editor#neu` | neuen Case bzw. neue Lernstrecke anlegen |
| `/editor#case=<id>`, `#kb=<id>`, `/lern-editor#k=<id>` | einen Eintrag öffnen |
| `…#projekt` | Projekt-Dialog öffnen (auf jeder Seite mit Navigation) |

## Projekte und Zielanwendung

Ein **Projekt** ist ein Auftrag mit einer Zielanwendung, z. B. „Einführung Kundenportal“ für die Muster GmbH. Cases,
Lernstrecken und Medien gehören immer zu genau einem Projekt; Startseite, Cases, Lernstrecken, Wissen, Updates und die
Lernansicht zeigen nur das aktuelle Projekt.

- **Wechseln:** oben in der Navigation; die Liste ist nach Kunde gruppiert und durchsuchbar.
- **Neues Projekt:** im Projektwechsel oder über `#projekt-neu`; es wird gleich geöffnet.
- **Projekte verwalten:** Überblick mit Anzahl der Cases, Lernstrecken und Medien, öffnen, archivieren,
  wiederherstellen. Archivierte Projekte verschwinden nur aus dem Wechsel, ihre Inhalte bleiben.
- **Projekt-Einstellungen** (unten in der Navigation): Projektname, Kunde, Name und Adresse der Zielanwendung,
  Zielgruppe der Lernstrecken. Die Adresse ist optional: Ohne sie (oder ohne Appilot in der Anwendung) nimmt man mit der
  Erweiterung auf oder legt Schritte von Hand an.

Daten: Tabelle `projects` (`id`, `title`, `kunde`, `name`, `url`, `audience`, `seenVersion`, `archived`), jeder Case,
jede Lernstrecke und jeder Eintrag unter „Wissen“ hat `projectId`. Das aktuelle Projekt steht unter meta
`aktuellesProjekt`. Beim ersten Start nach der Umstellung wird aus dem bisherigen Projekt (meta `projekt`) das erste
Projekt, und alle vorhandenen Inhalte kommen dort hinein.

Name und Zielgruppe fließen in die Anweisungen an die KI, die Adresse in Aufnahme, Probelauf, Video, Update-Check und
in die Praxis-Bausteine der Lernstrecken (auch im SCORM-Paket).

Aufnahme, Probelauf, Bildschirmfotos und die Karte der Anwendung laufen über das **Appilot-Protokoll**: Das Studio lädt
die Zielanwendung im Rahmen mit `?appilot=record` oder `?appilot=play` und tauscht Nachrichten (`postMessage`) nur mit
der Herkunft der eingetragenen Adresse aus. Auf Seite der Anwendung antwortet Appilot, heute als eingebundenes Skript,
später über die Browser-Erweiterung.

| Richtung | Nachricht | Bedeutung |
| --- | --- | --- |
| Anwendung → Studio | `{ appilot: "ready", mode }` | Anwendung geladen, Appilot bereit |
| Anwendung → Studio | `{ appilot: "step", step }` | ein aufgezeichneter Schritt (Aufnahme) |
| Studio → Anwendung | `{ appilotCmd, id, arg }` | Befehl: `map`, `reset`, `run`, `rect`, `shot`, `hash`, `messages` |
| Anwendung → Studio | `{ appilotReply: id, result }` | Antwort auf einen Befehl |

Mit `?appilotCase=<id>` öffnet die Anwendung einen freigegebenen Case zum Mitmachen.

### Schritte von Hand

Für Anwendungen ohne Appilot legt man Schritte selbst an („+ Schritt“): Titel, Erklärung, Aktion (klicken, eintragen,
wählen …), Element und Beispielwert. Je Schritt kommt ein Bildschirmfoto dazu (auswählen, hineinziehen oder mit ⌘V/Strg+V
einfügen); darauf markiert man mit der Maus den Bereich, den Video und Klickanleitung hervorheben. Video und
Klickanleitung entstehen dann aus diesen Bildern, ohne die Anwendung. Probelauf und Update-Check gibt es für solche
Cases nicht.

Datenformat (abwärtskompatibel, nur zusätzliche Felder am Schritt):

```json
{ "manual": true, "action": "click", "label": "Knopf „Speichern“", "value": "", "title": "…", "text": "…",
  "shot": { "dataUrl": "data:image/jpeg;base64,…", "width": 1600, "height": 1000 },
  "rect": { "x": 1082, "y": 203, "w": 269, "h": 88 } }
```

`shot` und `rect` haben dasselbe Format wie die Antworten `shot` und `rect` des Appilot-Protokolls; Bilder werden auf
höchstens 1600 Pixel Breite verkleinert und als JPEG gespeichert. Die spätere Browser-Erweiterung füllt dieselben Felder
automatisch. An die KI gehen die Bilder nicht.

### Aufnahme importieren

Unter Cases → **Aufnahme importieren** übernimmt das Studio eine Datei `.appilot.json` aus der Browser-Erweiterung
`extension/` (Installation und Bedienung: `extension/README.md`, Plan: `docs/erweiterung.md`). Es entsteht ein Case im Entwurf mit Schritten wie bei „Schritte von Hand“
(`manual: true`, `source: "erweiterung"`) und vorläufigen Titeln („Auf ‚Speichern‘ klicken“); danach „Texte von
Appilot formulieren“. Zum Ausprobieren ohne Erweiterung: `docs/beispiel-aufnahme.appilot.json`.

```json
{ "format": "appilot-aufnahme", "version": 1, "title": "Neuen Kunden anlegen",
  "app": { "url": "https://portal.example.de/kunden", "title": "Kundenportal" },
  "created": "2026-11-05T14:00:00Z", "recorder": "Appilot-Aufnahme 0.1.0",
  "steps": [ { "action": "click", "label": "Knopf „Neuer Kunde“", "name": "Neuer Kunde", "role": "button",
               "value": "", "valueText": "", "secret": false, "url": "…", "pageTitle": "Kunden",
               "shot": { "dataUrl": "data:image/jpeg;base64,…", "width": 1600, "height": 1000 },
               "rect": { "x": 1082, "y": 203, "w": 269, "h": 88 } } ] }
```

Die Datei gilt als fremde Eingabe (`lib/aufnahme.js`): höchstens 50 MB und 100 Schritte, nur Bilder als JPEG, PNG oder
WebP, Markierungen müssen im Bild liegen, Adressen nur `http(s)`, Texte werden gekürzt, unbekannte Felder verworfen.
Jedes Bild wird über eine Zeichenfläche neu erzeugt. Bei `secret: true` (Passwortfeld) bleibt der Wert leer.

### Update-Check

Bei jeder Freigabe merkt sich das Studio die Karte der Bedienelemente, die der Case nutzt. Nach einem Update der
Zielanwendung vergleicht es die neue Karte damit, zeigt Befunde (kaputt, prüfen, neu), betroffene Videos, Klickanleitungen,
Sprachfassungen und Lernstrecken, schlägt eine neue Fassung vor und übernimmt sie nach Bestätigung als Entwurf. Dazu
entsteht eine Nutzerkarte „Neu in Version …“.

Die Karte kommt aus der Zielanwendung (`map`) oder aus einer JSON-Datei („Karte aus Datei prüfen“):

```json
{
  "version": "3.2",
  "screens": [{ "id": "kunde", "title": "Kunde anlegen" }],
  "controls": [
    { "id": "name", "type": "text", "label": "Name", "screen": "kunde", "required": true, "hint": "Wie im Handelsregister" },
    { "id": "zahlungsziel", "type": "select", "label": "Zahlungsziel", "screen": "kunde",
      "options": [{ "value": "30", "text": "30 Tage" }] }
  ]
}
```

Hat ein freigegebener Case noch keinen Vergleichsstand, gilt die erste geprüfte Karte als Vergleichsstand.

## Speicher

Alle Seiten lesen und schreiben über `lib/store.js`. Heute liegt alles im Browser (`lib/store-idb.js`, IndexedDB, Version
2 mit Tabelle `projects`); später kommt ein Server-Speicher mit derselben Schnittstelle. `lib/store.js` filtert Cases,
Lernstrecken und Wissen auf das aktuelle Projekt und setzt bei neuen Einträgen `projectId`. Die Datenformate von Case und
Lernstrecke bleiben gleich (nur `projectId` kommt dazu). Solange die Daten im Browser liegen, sieht jede Person nur ihre
eigenen Projekte.

## Arbeitsweise

Kleine Pull Requests, Commits und Texte auf Deutsch. Sicherheit nach dem betterknow Security Framework.
