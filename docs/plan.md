# Arbeitsplan Appilot Studio

Ziel: MVP zur LEARNTEC Anfang Februar 2027. Konzept: `docs/konzept.md`.
Claude Code hakt hier ab und ergänzt neue Aufgaben. Reihenfolge = Vorschlag.

## Schritt 1 – Übernahme aus der MVDemo ✅

- [x] Repo `Mhalb/appilotstudio` angelegt, README, .gitignore
- [x] Case-Editor, Lern-Editor, Lernansicht, Medien, SCORM, Sprachen, Update-Check übernommen (PR #1)
- [x] HKR-Bezüge entfernt, Zielanwendung als Projekteinstellung
- [x] Speicher hinter `lib/store.js` gekapselt (heute `lib/store-idb.js`)
- [x] Vercel-Projekt `appilotstudio` mit Production und Preview

## Schritt 2 – Anmeldung, Server-Speicher, Rollen (vorgezogen, Stand 5. 11. 2026)

Ziel: Das Studio arbeitet eigenständig. Nur angemeldete Nutzer kommen hinein, Inhalte liegen auf dem Server und
sind im Team geteilt, die Freigabe läuft mit echten Rollen. Entschieden: Anmeldung mit E-Mail und Passwort,
Daten in einer Datenbank.

**Technik (Vorschlag)**

- Datenbank: Postgres über Neon (Vercel Marketplace), Region Frankfurt. Normales Postgres, damit später auch
  on-prem möglich. Eine neue Abhängigkeit: `postgres` (postgres.js, Lizenz Unlicense, ohne weitere Abhängigkeiten).
- Tabellen: `users` (E-Mail, Name, Rolle, aktiv, Passwort-Hash), `sessions` (nur Hash des Tokens, Ablauf),
  `invites` (einmaliger Link, Ablauf), `items` (Tabelle `cases`/`kb`/`courses`/`meta`, ID, Inhalt als JSONB,
  Version, geändert von/am). Die Datenformate von Case und Lernstrecke bleiben unverändert.
- Passwörter: `scrypt` aus `node:crypto`, keine Fremdbibliothek. Mindestens 12 Zeichen.
- Sitzung: zufälliges Token im Cookie (`HttpOnly`, `Secure`, `SameSite=Lax`), 12 Stunden gültig, in der Datenbank
  nur als Hash. Nach 5 Fehlversuchen ist das Konto 15 Minuten gesperrt.
- Keine Selbstregistrierung. Ein Admin lädt Nutzer ein und bekommt einen Einladungslink zum Weitergeben (kein
  Mail-Dienst nötig). „Passwort vergessen“ = Admin erzeugt einen neuen Link. Den ersten Admin legt
  `node scripts/admin.mjs` an.
- Rollen: Autor, Prüfer (Freigeber), Admin. Ein Mandant. Der Rollen-Umschalter im Editor entfällt; Namen kommen aus
  dem Konto. Der Server prüft Statuswechsel: Nur Prüfer geben frei, nie den eigenen Case (Vier-Augen-Prinzip).
- Schnittstellen: `/api/auth` (anmelden, abmelden, wer bin ich), `/api/store` (lesen, schreiben, löschen),
  `/api/users` (nur Admin). `/api/appilot` und `/api/tts` nur noch für Angemeldete.
- Seiten: neue Seite `/anmelden`; die Studio-Seiten leiten ohne Sitzung dorthin um.
- Speicher: `lib/store-server.js` mit derselben Schnittstelle wie `lib/store-idb.js`. Gleichzeitige Änderungen
  erkennt der Server über die Version (kein stilles Überschreiben).

**Aufgaben (je ein kleiner PR)**

- [x] Plan vorlegen und Anmeldeart entscheiden
- [x] Datenbank anlegen (Neon in Frankfurt über Vercel), `DATABASE_URL` für Production und Preview
- [x] Anmeldung: Tabellen, `/api/auth`, Seite `/anmelden`, Schutz von Seiten, `/api/appilot` und `/api/tts`,
      Skript für den ersten Admin (Branch `feature/anmeldung`)
- [ ] Eigene Datenbank für Preview-Deployments (Neon-Branch), damit Vorschauen nicht auf Production-Daten schreiben
- [ ] Nutzerverwaltung für Admins: einladen, Rolle ändern, sperren, neuen Link erzeugen
- [ ] Server-Speicher `lib/store-server.js` und `/api/store`; einmalig „Daten aus diesem Browser übernehmen“
- [ ] Echte Rollen in Case-Editor und Lern-Editor; Server prüft die Freigabe
- [ ] Sicherheitsprüfung gegen das Security Framework (Cookies, Fehlversuche, Rechte, Schlüssel)
- [ ] Medien (Videos, PDFs) serverseitig ablegen (Vercel Blob in der EU) – danach

## Zwischendurch – Bedienung (Rundgang 5. 11. 2026)

Befund: Bei Anwendungen ohne Appilot ließ sich kein Case mit Schritten erstellen (Entwurf und Aufnahme brauchen beide
Appilot in der Anwendung).

- [x] Schritte von Hand mit Bildschirmfoto und markiertem Bereich; Video und Klickanleitung daraus (Branch `feature/schritte-von-hand`)
- [x] Gemeinsame Navigation links in Start, Case-Editor und Lern-Editor; Projekt-Dialog überall (Branch `feature/navigation-start`)
- [x] Startseite „Meine Aufgaben“ (in Arbeit, zur Prüfung, nachbessern) mit „Erste Schritte“ für den ersten Start
- [ ] „Meine Aufgaben“ nach Konto filtern, sobald es echte Rollen gibt
- [ ] Case: „Beschreiben“ und „Aufnehmen“ als Alternativen statt 1 und 2; Freigabe-Leiste erst, wenn es Schritte gibt
- [ ] Verständliche Meldungen (kein „API-Schlüssel in Vercel“); Projekt-Dialog und Rückmeldung beim Speichern sind erledigt
- [ ] Lern-Editor: Entwurfsbereich nach „Gerüst einfügen“ schließen

## Schritt 3 – Aufnahme in beliebigen Web-Apps (Browser-Erweiterung)

Plan: `docs/erweiterung.md`. Die Erweiterung füllt dieselben Felder wie die Schritte von Hand (Aktion, Element, `shot`,
`rect`); Übergabe zuerst als Datei („Aufnahme importieren“).

- [x] Plan vorlegen: Aufbau, Berechtigungen (wenige, mehr nur auf Anfrage), Datenformat, Übergabe
- [x] Live-Check-Erweiterung aus `Mhalb/appilot2` gesichtet: Rechteck und Barrierefreiheitsbaum übernehmen, `debugger` nur auf Anfrage
- [ ] Prüfpunkte vorab: Seitenwechsel mit `activeTab`, Bild vor dem Klick, Qualität der Namen
- [x] PR 1: Studio „Aufnahme importieren“ mit Prüfung der Datei und Beispieldatei (Branch `feature/aufnahme-import`)
- [ ] PR 2: Erweiterung mit Aufnahme, Bildern, Übersichtsseite und Datei speichern
- [ ] PR 3: Rechte auf Anfrage (Seitenwechsel, eingebettete Bereiche, Barrierefreiheitsbaum)
- [ ] PR 4: Sicherheitsprüfung gegen das Security Framework, Tests, Anleitung
- [ ] Aufnahme in einer fremden Web-App (z. B. eigene Nextcloud) Ende-zu-Ende: Aufnahme → Case → Video → Klickanleitung
- [ ] Modell-Schnittstelle: Claude in der EU, Kolibri vorbereitet

## Schritt 4 – Messe-Reife (Januar 2027)

- [ ] Beispielanwendung ohne HKR-Bezug mit einem Beispielablauf
- [ ] Ablauf funktioniert auch offline bzw. mit schlechtem Messe-WLAN (Fallbacks)
- [ ] Ausblick Stufe 2: Appilot in der Beispielanwendung
- [ ] Testläufe im Team, Demo-Drehbuch im README

## Später (nach LEARNTEC)

- [ ] Stufe 2: Appilot in der Anwendung, Pilotkunden
- [ ] Nextcloud-Integration, Ablage auf DiSI
- [ ] Mandanten, SCORM 2004, xAPI, Abrechnung
