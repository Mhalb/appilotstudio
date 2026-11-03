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

## Arbeitsweise

Kleine Pull Requests, Commits und Texte auf Deutsch. Sicherheit nach dem betterknow Security Framework.
