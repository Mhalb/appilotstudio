# Appilot Studio – Hinweise für Claude Code

Appilot Studio (Arbeitstitel) ist ein eigenständiges Autorentool der betterknow GmbH (bk) für Klickanleitungen,
Schulungsvideos und Lernstrecken zu beliebigen Web-Anwendungen, mit Appilot als KI-Hilfe.
**Ziel: vorführbarer MVP zur LEARNTEC Anfang Februar 2027.**

Lies vor jeder größeren Aufgabe:

- `docs/konzept.md` – Produktkonzept: Positionierung, Zuschnitt Studio und Appilot, MVP, Architektur, Roadmap
- `docs/plan.md` – Arbeitsplan mit Status. **Nach jeder erledigten Aufgabe dort abhaken bzw. ergänzen.**
- `README.md` – Aufbau, Starten, Vercel, Appilot-Protokoll, Update-Check, Speicher

## Feste Regeln

- **Eigenständiges Produkt.** Keine Anbindung an die bk Workbench. Nextcloud und DiSI erst nach dem Pilot (siehe Roadmap).
- **`~/Code/MVDemo` nur lesen, nie ändern.** Sie bleibt als Demo-Stand für MV. Code von dort wird kopiert, nicht verschoben.
- **Keine HKR-Bezüge** (Texte, Versionen, Beispieldaten). Die Zielanwendung ist eine Projekteinstellung.
- **Datenformate** von Case und Lernstrecke bleiben stabil; Änderungen nur abwärtskompatibel und im README dokumentiert.
- **Speicher nur über `lib/store.js`.** Kein direkter Zugriff auf IndexedDB oder Server aus den Seiten.
- **KI nur über `api/appilot.js`** und eine austauschbare Modell-Schnittstelle (Claude in der EU, Kolibri vorbereitet).
  API-Schlüssel nie in den Client, nie ins Repo.
- **Videos immer vertont**, Sprecher über ElevenLabs (`api/tts.js`). Ohne Schlüssel: Video ohne Ton, kein Abbruch.
- **Sicherheit nach dem betterknow Security Framework** – besonders Schlüssel, Rollen/Freigabe und die Rechte der
  Browser-Erweiterung (so wenige Berechtigungen wie möglich, Host-Rechte nur auf Anfrage).
- Ohne Build-Schritt, Vanilla JS, Node ≥ 20. Neue Abhängigkeiten nur mit Begründung und Lizenz in `vendor/` bzw. README.

## Arbeitsweise

- Pro Aufgabe ein Branch `feature/<kurz>` und ein kleiner Pull Request gegen `main`; `main` geht direkt in Production.
- Commits, Texte, UI und Doku auf Deutsch, in klarer, einfacher Sprache.
- Vor dem PR lokal starten (`node server.mjs`) und den betroffenen Ablauf einmal durchspielen.
- Bei Unklarheit über Produktumfang erst fragen und `docs/konzept.md` prüfen, nicht Funktionen „auf Verdacht“ bauen.
  Das Studio soll schlank bleiben.
