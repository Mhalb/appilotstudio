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
| Host-Recht für **genau die Adresse** der Anwendung | auf Anfrage beim Start, nur wenn nötig | Aufnahme läuft über Seitenwechsel hinweg weiter (siehe Prüfpunkt 1) |
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
- **Bildschirmfotos** über `chrome.tabs.captureVisibleTab` (sichtbarer Bereich). Chrome erlaubt höchstens zwei Aufnahmen
  pro Sekunde. Deshalb hält die Erweiterung immer das **letzte ruhige Bild** bereit (neu nach Laden, Scrollen und
  Änderungen der Seite) und nimmt beim Klick dieses Bild. So zeigt das Bild sicher den Stand vor dem Klick.
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

## Prüfpunkte vorab (kleiner Test, bevor gebaut wird)

1. **Seitenwechsel:** Behält `activeTab` den Zugriff, wenn die Anwendung eine neue Seite lädt? Wenn nicht, fragt die
   Erweiterung beim Start einmal nach dem Recht für genau diese Adresse.
2. **Bild vor dem Klick:** Wie oft ist das „letzte ruhige Bild“ in schnellen Anwendungen (z. B. SAP Fiori, Nextcloud)
   wirklich der richtige Stand?
3. **Namen:** Wie gut sind die Namen ohne Barrierefreiheitsbaum in zwei echten Anwendungen? Davon hängt ab, wie oft
   `debugger` nötig ist.

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
