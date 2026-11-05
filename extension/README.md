# Appilot-Aufnahme (Browser-Erweiterung)

Nimmt einen Klickweg in einer beliebigen Web-Anwendung auf: Jeder Klick und jede Eingabe wird ein Schritt mit
Bildschirmfoto, markiertem Bereich, Name des Elements und Aktion. Die Aufnahme wird als Datei `.appilot.json`
gespeichert und im Appilot Studio unter **Cases → Aufnahme importieren** zu einem Case. Plan und Hintergründe:
`docs/erweiterung.md`.

Chrome und Edge ab Version 116.

## Installieren (Entwicklermodus)

1. Den Ordner `extension` aus diesem Repo auf den Rechner holen (Repo klonen oder als ZIP herunterladen und entpacken).
2. In Chrome `chrome://extensions` öffnen (Edge: `edge://extensions`), oben rechts **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** und den Ordner `extension` wählen.
4. Über das Puzzle-Symbol die **Appilot-Aufnahme** an die Symbolleiste anheften.

Nach einer Aktualisierung des Ordners auf `chrome://extensions` bei der Erweiterung auf ↻ klicken.

## Aufnehmen

1. Die Anwendung öffnen, anmelden und zur Startmaske gehen. Am besten in einer Testumgebung mit Beispieldaten.
2. Auf das Appilot-Symbol klicken, Namen des Ablaufs eingeben, Hinweis bestätigen, **Aufnahme starten**.
3. Den Ablauf ganz normal durchklicken. Das Symbol zeigt die Zahl der Schritte. Die Erweiterung blendet nichts in die
   Seite ein.
4. Wieder auf das Symbol klicken, **Aufnahme beenden**. Es öffnet sich die Übersicht: überflüssige Schritte löschen,
   Namen bei Bedarf verbessern, **Datei speichern**.
5. Im Studio unter **Cases → Aufnahme importieren** die Datei wählen. Danach „Texte von Appilot formulieren“ und
   „Video und Anleitung erzeugen“.

Wechselt die Anwendung die Adresse (z. B. Anmeldung über einen anderen Dienst), pausiert die Aufnahme und läuft weiter,
sobald die Anwendung wieder auf ihrer Adresse ist.

## Was aufgenommen wird – und was nicht

- **Klick** auf Knopf, Link, Reiter, Eintrag: Bild beim Drücken der Maustaste, also vor der Reaktion der Seite.
- **Eingabe, Auswahl, Häkchen:** Bild nach der Änderung, mit dem Wert als Beispielwert (abschaltbar beim Start).
- **Nie aufgezeichnet:** Werte aus Passwortfeldern und Feldern für Kartennummern und Einmalcodes.
- Die Aufnahme bleibt auf diesem Rechner (IndexedDB der Erweiterung), bis sie als Datei gespeichert oder verworfen
  wird. Die Erweiterung schickt nichts an einen Server.

## Berechtigungen

| Recht | Wofür |
| --- | --- |
| `activeTab` | Zugriff nur auf den Tab, in dem die Aufnahme gestartet wird, erst nach Klick auf das Symbol; bleibt bei Seitenwechseln auf derselben Adresse erhalten |
| `scripting` | das Aufnahme-Skript in diesen Tab laden |
| `storage` | Zustand der Aufnahme und „Hinweis gesehen“ |

Keine Rechte für alle Webseiten, Verlauf, Cookies, Downloads oder Netzwerkverkehr. Weitere Rechte nur auf Anfrage
(eingebettete Bereiche anderer Adressen, Barrierefreiheitsbaum) kommen in einem späteren Schritt, siehe Plan.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `manifest.json` | Manifest V3 |
| `sw.js` | Hintergrund: Start, Stopp, Bildschirmfotos, Seitenwechsel, Speichern der Schritte |
| `content.js` | Aufnahme-Skript im Tab: Klicks, Eingaben, Name und Bereich des Elements |
| `popup.html`, `popup.js` | Starten mit Hinweis, Beenden |
| `review.html`, `review.js` | Übersicht nach der Aufnahme, Datei speichern |
| `lib/db.js` | Speicher (IndexedDB) |
| `test/aufnahme.test.mjs` | Ende-zu-Ende-Test: Aufnahme auf Testseiten → Datei → Prüfung wie im Studio |

Symbole aus der Live-Check-Erweiterung (`Mhalb/appilot2`) übernommen.

## Test

```bash
npm i --no-save playwright && npx playwright install chromium
node extension/test/aufnahme.test.mjs
```

Der Test kann nicht auf das Erweiterungssymbol klicken; er startet die Aufnahme deshalb direkt im Hintergrund und läuft
mit einer Kopie der Erweiterung, die zusätzlich das Recht für die Testadressen hat. Den Weg über `activeTab` prüft ein
Mensch im echten Browser.
