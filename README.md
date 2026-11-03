# Appilot Studio

Autorentool für Klickanleitungen, Schulungsvideos und Lernstrecken zu beliebigen Web-Anwendungen, mit Appilot als
KI-Hilfe. Arbeitstitel.

**Ziel:** vorführbarer MVP zur LEARNTEC Anfang Februar 2027.

## Was das Studio kann

- **Cases:** Arbeitsabläufe in der Zielanwendung, Schritt für Schritt. Entstehen aus einer Beschreibung (KI-Entwurf)
  oder durch Aufnehmen in der Anwendung. Probelauf, Prüfung und Freigabe.
- **Medien:** Erklärvideo mit Sprecher und Klickanleitung aus einem Case.
- **Lernstrecken:** interaktive Einheiten aus Szenario, Erklärung, Übungen, Praxis in der Anwendung und Spickzettel.
  KI-Entwurf, Tutor beim Lernen, Export als SCORM-Paket.
- **Sprachfassungen:** Übersetzung von Cases und Lernstrecken.
- **Update-Check:** Ändert sich die Zielanwendung, erkennt das Studio, welche Cases und Lernstrecken betroffen sind,
  schlägt Änderungen vor und führt sie nach Bestätigung durch.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `editor.html`, `lib/editor.js` | Case-Editor mit Wissensbasis und Update-Check |
| `lern-editor.html`, `lib/lern-editor.js` | Lern-Editor für Lernstrecken |
| `lernen.html`, `lib/lernen.js` | Lernansicht und Tutor |
| `lib/` | gemeinsame Bausteine: Projekt, Speicher, Zielanwendung, Medien, Kurs, SCORM, Sprachen, Update-Check |
| `api/` | Serverfunktionen: Appilot (KI) und Sprecher (Text zu Sprache) |
| `vendor/` | eingebundene Bibliotheken mit Lizenz |
| `server.mjs` | lokaler Server |

## Starten

```bash
npm install
node server.mjs
```

Danach läuft das Studio auf http://localhost:3000. Für die KI braucht es `ANTHROPIC_API_KEY`, für den Sprecher
`ELEVENLABS_API_KEY` in der Umgebung oder in `.env`.

## Projekt und Zielanwendung

Unter **Projekt** im Case-Editor stehen Name und Adresse der Zielanwendung und die Zielgruppe der Lernstrecken.
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

Alle Seiten lesen und schreiben über `lib/store.js`. Heute liegt alles im Browser (`lib/store-idb.js`, IndexedDB); in
Schritt 2 kommt ein Server-Speicher mit derselben Schnittstelle. Die Datenformate von Case und Lernstrecke bleiben gleich.

## Arbeitsweise

Kleine Pull Requests, Commits und Texte auf Deutsch. Sicherheit nach dem betterknow Security Framework.
