# Plan: Browser-Erweiterung „Appilot-Aufnahme“

Stand: 5. November 2026 · Entwurf zur Abstimmung · Gehört zu Schritt 3 in `docs/plan.md`

## Ziel

Ein Klickweg in einer beliebigen Web-Anwendung wird im eigenen Browser aufgenommen. Aus jedem Klick und jeder Eingabe
entsteht ein Schritt mit Bildschirmfoto, markiertem Bereich, Name des Elements und Aktion. Die Aufnahme kommt als
Datei ins Studio („Aufnahme importieren“) und wird dort zu einem Case. Video und Klickanleitung entstehen wie bei
Schritten von Hand, die KI formuliert die Texte.

Damit funktioniert der Kern der LEARNTEC-Vorführung auch mit Anwendungen, in denen Appilot nicht eingebunden ist:
„Besucher nennt eine Web-Anwendung, wir nehmen einen Ablauf auf, nach wenigen Minuten gibt es Video, Anleitung und
SCORM.“

## Entschieden (5. 11. 2026)

- **So wenige Rechte wie nötig.** Mehr Rechte nur auf Anfrage, wenn Appilot sonst nichts erkennt, mit Zustimmung im
  Chrome-Dialog, und danach wieder abgeben.
- **Übergabe zuerst als Datei** („Aufnahme importieren“ im Studio). Direkte Übergabe per Knopfdruck später.
- **Hinweis zu echten Daten** in der Erweiterung: Bildschirmfotos zeigen, was auf dem Bildschirm steht.
- Code aus der Live-Check-Erweiterung (`Mhalb/appilot2`, `toolbox/live-check`) wird **kopiert, nicht verschoben**.
  Die Erweiterung liegt im Studio-Repo unter `extension/`.

## So läuft eine Aufnahme ab

1. Zielanwendung öffnen, anmelden, zur Startmaske gehen. Am besten in einer Testumgebung mit Beispieldaten.
2. Auf das Appilot-Symbol klicken, Namen des Ablaufs eingeben, **Aufnahme starten**. Beim ersten Mal erscheint der
   Hinweis zu echten Daten.
3. Den Ablauf ganz normal durchklicken. Das Symbol zeigt einen roten Punkt und die Zahl der Schritte. In der Seite
   selbst blendet die Erweiterung nichts ein, damit nichts davon auf den Bildern landet.
4. **Aufnahme beenden**. Es öffnet sich eine Übersichtsseite der Erweiterung: alle Schritte mit Bild und Markierung.
   Überflüssige Schritte löschen, Namen korrigieren.
5. **Datei speichern** (`.appilot.json`). Im Studio unter Cases **Aufnahme importieren**: Es entsteht ein Case im
   Entwurf. Danach wie gewohnt: Texte von Appilot formulieren, Video und Anleitung erzeugen, Prüfung, Freigabe.

## Berechtigungen

| Recht | Wann | Wofür |
| --- | --- | --- |
| `activeTab` | immer, greift erst nach Klick auf das Symbol | Zugriff nur auf den Tab, in dem die Aufnahme startet |
| `scripting` | immer | Aufnahme-Skript in diesen Tab laden |
| `storage` | immer | Einstellungen (z. B. Hinweis gesehen) |
| Host-Recht für eine **weitere Adresse** der Anwendung | auf Anfrage, wenn die Anwendung die Adresse wechselt | Aufnahme läuft weiter (innerhalb derselben Adresse reicht `activeTab`, siehe Prüfpunkt 1) |
| Host-Recht für eine **eingebettete Adresse** (iframe) | auf Anfrage, wenn ein Klick in einem fremden Rahmen landet | Klicks und Namen auch dort erkennen |
| `debugger` | auf Anfrage, wenn Elemente keinen verständlichen Namen haben | Barrierefreiheitsbaum lesen wie der Live-Check |

Alles auf Anfrage steht in `optional_permissions` bzw. `optional_host_permissions`, Chrome fragt jedes Mal selbst nach,
und die Erweiterung gibt das Recht nach der Aufnahme mit `chrome.permissions.remove` wieder ab. Keine Rechte für
`downloads`, `history`, `cookies`, `webRequest` oder „alle Webseiten“. Bilder und Aufnahmen verlassen den Rechner nicht;
die Erweiterung schickt nichts an einen Server.

Grenzen: Anwendungen, die nur ein Bild zeichnen (Canvas) oder über Citrix bzw. Remote Desktop laufen, haben keine
lesbaren Elemente. Dort nimmt die Erweiterung nur Bildschirmfotos auf; den Bereich markiert man im Studio von Hand.
Auf verwalteten Rechnern kann die IT Erweiterungen sperren; dann bleiben die Schritte von Hand.

## Was je Schritt aufgenommen wird

| Ereignis | Bild | Aktion | Wert |
| --- | --- | --- | --- |
| Klick auf Knopf, Link, Reiter | **vor** dem Klick | `click` | – |
| Eingabe in ein Textfeld (beim Verlassen des Felds) | **nach** der Eingabe | `input` | der eingegebene Text |
| Auswahl in einer Liste | nach der Auswahl | `select` | sichtbarer Text der Option |
| Häkchen setzen | nach dem Klick | `check` | – |
| Datei wählen | vor dem Klick | `upload` | nur der Dateiname |

- **Nie aufgezeichnet:** Werte aus Passwortfeldern und aus Feldern für Kartennummern, Einmalcodes und ähnliches
  (`type=password`, `autocomplete=cc-*`, `one-time-code`). Der Schritt entsteht, der Wert bleibt leer.
- Schalter „Eingaben nicht aufzeichnen“ im Popup für Anwendungen mit echten Daten.
- **Name des Elements** wie ein Screenreader ihn liest: `aria-label`, `aria-labelledby`, zugehöriges `<label>`, `title`,
  Platzhalter, sichtbarer Text. Rolle aus dem Element (Knopf, Feld, Liste …). Daraus „Knopf ‚Speichern‘“.
- **Bereich:** Rechteck des Elements, umgerechnet auf die Pixel des Bildschirmfotos.

## Technik

- **Manifest V3**, Chrome und Edge. Service Worker, Popup, Aufnahme-Skript, Übersichtsseite. Kein Build-Schritt.
- **Bildschirmfotos** über `chrome.tabs.captureVisibleTab` (sichtbarer Bereich, etwa 30–90 ms). Chrome erlaubt höchstens
  zwei Aufnahmen pro Sekunde. Bei Klicks entsteht das Bild **beim Drücken der Maustaste** (`pointerdown`), also bevor die
  Seite auf den Klick reagiert; geöffnete Menüs und Hover-Zustände sind damit zu sehen. Zusätzlich hält die Erweiterung
  ein **letztes ruhiges Bild** bereit (höchstens eins pro Sekunde, damit beim Klick Luft im Kontingent bleibt) und nimmt
  es, wenn das Bild beim Drücken scheitert oder die Seite schon vorher eine neue Adresse geladen hat. Bei Eingaben
  entsteht das Bild nach dem Verlassen des Felds.
- Bilder werden wie im Studio auf höchstens 1600 Pixel Breite verkleinert und als JPEG gespeichert.
- Aufnahmen liegen bis zum Speichern in IndexedDB der Erweiterung (dafür ist kein Recht nötig) und werden nach dem
  Speichern bzw. Verwerfen gelöscht.
- **Datei speichern** über einen normalen Download-Link auf der Übersichtsseite, ohne das Recht `downloads`.
- Aus dem Live-Check übernommen: Rechteck eines Elements bestimmen, Barrierefreiheitsbaum lesen (nur mit `debugger`
  auf Anfrage). Nicht übernommen: Ampel-Messung, Verpixeln, Report.

## Datenformat `.appilot.json`

Ein Schritt hat dieselben Felder wie ein Schritt von Hand im Studio (siehe README). Dazu kommen Angaben zur Herkunft:
`name` ist der Name des Elements ohne Rolle (für die vorläufigen Titel), `secret: true` kennzeichnet Passwortfelder und
ähnliche, deren Wert nie in der Datei steht. `rect` ist in Pixeln von `shot.width` × `shot.height` angegeben.

```json
{
  "format": "appilot-aufnahme",
  "version": 1,
  "title": "Kunden anlegen",
  "app": { "url": "https://portal.example.de/kunden", "title": "Kundenportal" },
  "created": "2026-11-05T14:00:00Z",
  "recorder": "Appilot-Aufnahme 0.1.0",
  "steps": [
    {
      "action": "click", "label": "Knopf „Neuer Kunde“", "name": "Neuer Kunde", "role": "button",
      "value": "", "valueText": "", "secret": false,
      "url": "https://portal.example.de/kunden", "pageTitle": "Kunden",
      "shot": { "dataUrl": "data:image/jpeg;base64,…", "width": 1600, "height": 1000 },
      "rect": { "x": 1082, "y": 203, "w": 269, "h": 88 }
    }
  ]
}
```

**Im Studio:** „Aufnahme importieren“ prüft die Datei wie fremde Daten: Format und Version, höchstens 100 Schritte und
50 MB, nur Bilder als `data:image/jpeg` oder `png`, alle Texte gekürzt, jedes Bild wird über eine Zeichenfläche neu
erzeugt. Es entsteht ein Case im Entwurf mit `manual: true`, `source: "erweiterung"` und vorläufigen Titeln wie
„Auf ‚Neuer Kunde‘ klicken“. Danach „Texte von Appilot formulieren“.

## Prüfpunkte vorab – Ergebnisse (5. 11. 2026)

Gemessen mit einem Test-Gerüst der Erweiterung in Chromium 128 (automatisiert, Klicks mit Hover und 110 ms
Drückdauer) in der SAP-Fiori-Demo „Shopping Cart“ (ui5.sap.com) und auf betterknow.de (Seitenwechsel). Nextcloud steht
noch aus.

1. **Seitenwechsel – geklärt.** Laut Chromium-Quellcode (`ActiveTabPermissionGranter::DidFinishNavigation`) bleibt
   `activeTab` bei Seitenwechseln **innerhalb derselben Adresse** (gleiche Herkunft) erhalten und endet erst beim Wechsel
   auf eine andere Adresse. Folgen: Das Aufnahme-Skript wird nach jedem Laden einer Seite neu eingesetzt
   (`chrome.tabs.onUpdated` + `scripting.executeScript`, dafür reicht `activeTab`). Wechselt die Anwendung die Adresse
   (z. B. Anmeldung über Microsoft und zurück), pausiert die Aufnahme und bietet an, das Recht für die neue Adresse
   anzufragen.
2. **Bild vor dem Klick – Lösung gefunden.** Das zuerst geplante „letzte ruhige Bild“ allein reicht nicht: Auf
   betterknow.de ändert der Hover-Effekt die Seite direkt vor dem Klick, das Bild war in 3 von 3 Klicks veraltet. Ein Bild
   **beim Drücken der Maustaste** war in allen Fällen 30–90 ms nach dem Drücken fertig, vor jeder Reaktion auf den Klick
   (kein Seitenwechsel, kein neuer Inhalt). In der Fiori-Demo zeigt es den Knopf im gedrückten Zustand, das ist in
   Ordnung. Zweimal scheiterte es am Limit von zwei Bildern pro Sekunde; deshalb höchstens ein ruhiges Bild pro Sekunde
   und das ruhige Bild als Rückfall.
3. **Namen – ohne `debugger` meist gut.** Namen wie ein Screenreader (aria-label, label, Text): betterknow.de 17 von 18
   Elementen verständlich (Ausnahme: Logo mit Dateinamen), Fiori-Demo 60 von 60 mit Namen. Bei Listeneinträgen in Fiori
   kommen aber Preis und unsichtbarer Hinweistext mit („10" Portable DVD player 449,99 EUR Hervorgehoben …“). Die
   Erweiterung nimmt deshalb den Titel des Eintrags und lässt Texte weg, die nur für Screenreader gedacht sind
   (`sapUiInvisibleText`, `sr-only`, abgeschnittene Bereiche). `debugger` bleibt die Ausnahme auf Anfrage.

Das Test-Gerüst war ein Wegwerf-Stand und liegt nicht im Repo; die Erweiterung wird in PR 2 sauber aufgebaut.

Beim Bau (PR 2) zusätzlich gelernt: Tippen in ein Feld ändert den DOM nicht; nach Eingaben macht die Erweiterung
deshalb immer ein frisches Bild (150 ms nach der Änderung, damit der Wert gezeichnet ist) und nie das ruhige Bild.

## Umsetzung in kleinen PRs

| # | Inhalt | Ergebnis |
| --- | --- | --- |
| 1 | Studio: „Aufnahme importieren“, Prüfung der Datei, Beispieldatei | Import lässt sich ohne Erweiterung testen |
| 2 | Erweiterung: Manifest, Popup mit Hinweis, Aufnahme von Klicks und Eingaben, Bilder, Übersichtsseite, Datei speichern | Ende-zu-Ende in einer einfachen Anwendung |
| 3 | Rechte auf Anfrage: Seitenwechsel, eingebettete Bereiche, Barrierefreiheitsbaum | funktioniert in Nextcloud und einer SAP-Fiori-Demo |
| 4 | Prüfung gegen das betterknow Security Framework, Tests (Chromium mit geladener Erweiterung wie beim Live-Check), Anleitung im README | bereit für Testläufe im Team |
| später | Direkte Übergabe ans Studio (`externally_connectable` nur für die Studio-Adresse), Verteilung über Chrome Web Store (nicht gelistet) oder Unternehmensrichtlinie | – |

Für die LEARNTEC reicht die Installation im Entwicklermodus auf den Messe-Rechnern.

## Offene Fragen

- Chrome und Edge, oder auch Firefox? (Vorschlag: Chrome und Edge, Firefox später)
- Eingaben standardmäßig aufzeichnen oder nicht? (Vorschlag: aufzeichnen, mit Schalter zum Abschalten)
- Welche zwei Anwendungen nehmen wir für die Prüfpunkte? (Vorschlag: eigene Nextcloud und eine öffentliche
  SAP-Fiori-Demo)
- Name der Erweiterung: „Appilot-Aufnahme“ als Arbeitstitel
