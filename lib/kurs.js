// Lernstrecken: Bausteintypen und Regeln, gemeinsam für Lern-Editor und Lernstrecken-Seite.
(function () {
  // Felder je Typ. kind: text, area, number, bool, case, points, options, pairs, strings, questions
  const TYPES = {
    szenario: {
      label: "Szenario", icon: "📋", hint: "Der Arbeitsauftrag, um den sich die Lernstrecke dreht.",
      fields: [["title", "text", "Überschrift"], ["text", "area", "Geschichte und Auftrag"]],
    },
    erklaerung: {
      label: "Erklärung", icon: "💡", hint: "Kurze Theorie in 3 bis 4 Kernpunkten. Daraus entsteht auf Knopfdruck ein Erklärvideo.",
      fields: [["title", "text", "Überschrift"], ["text", "area", "Einleitung"], ["points", "points", "Kernpunkte"], ["merksatz", "text", "Merksatz"], ["quelle", "text", "Quelle (Regelwerk, Handbuch, Vorgabe)"]],
    },
    auswahl: {
      label: "Auswahlfrage", icon: "☑", hint: "Eine Frage mit Feedback zu jeder Antwort.",
      fields: [["title", "text", "Überschrift"], ["frage", "area", "Frage"], ["optionen", "options", "Antworten"], ["mehrfach", "bool", "Mehrere Antworten richtig"]],
    },
    zuordnen: {
      label: "Zuordnen", icon: "⇄", hint: "Begriffe und Bedeutungen einander zuordnen.",
      fields: [["title", "text", "Überschrift"], ["frage", "area", "Aufgabe"], ["paare", "pairs", "Paare"]],
    },
    rechnen: {
      label: "Rechenaufgabe", icon: "🧮", hint: "Eine Rechenaufgabe aus dem Szenario.",
      fields: [["title", "text", "Überschrift"], ["frage", "area", "Aufgabe"], ["loesung", "number", "Lösung"], ["toleranz", "number", "Erlaubte Abweichung"], ["einheit", "text", "Einheit"], ["hinweis", "text", "Hinweis bei falscher Antwort"], ["erklaerung", "area", "Rechenweg"]],
    },
    reihenfolge: {
      label: "Reihenfolge", icon: "↕", hint: "Schritte eines Ablaufs in die richtige Reihenfolge bringen. Hier in der richtigen Reihenfolge eintragen.",
      fields: [["title", "text", "Überschrift"], ["frage", "area", "Aufgabe"], ["schritte", "strings", "Schritte (richtige Reihenfolge)"]],
    },
    praxis: {
      label: "Praxis in der Anwendung", icon: "▶", hint: "Die Lernenden wenden das Gelernte in der echten Anwendung an. Appilot führt sie durch einen freigegebenen Case.",
      fields: [["title", "text", "Überschrift"], ["text", "area", "Auftrag"], ["caseId", "case", "Case"]],
    },
    check: {
      label: "Wissenscheck", icon: "✓", hint: "Abschlussfragen. Bestanden ab zwei Dritteln richtiger Antworten.",
      fields: [["title", "text", "Überschrift"], ["frage", "area", "Einleitung"], ["fragen", "questions", "Fragen"]],
    },
    spickzettel: {
      label: "Spickzettel", icon: "📌", hint: "Die wichtigsten Merksätze. Wird bei der Freigabe in die Wissensdatenbank übernommen, damit Appilot ihn in der Anwendung nutzen kann.",
      fields: [["title", "text", "Überschrift"], ["punkte", "strings", "Merksätze"]],
    },
  };

  const EMPTY = { text: "", area: "", number: 0, bool: false, case: "", points: [], options: [], pairs: [], strings: [], questions: [] };

  function uid() {
    return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Leerer Baustein eines Typs mit genau den Feldern dieses Typs.
  function blank(type, values = {}) {
    const b = { id: uid(), type };
    for (const [key, kind] of TYPES[type].fields) b[key] = values[key] ?? structuredClone(EMPTY[kind]);
    if (!b.title) b.title = TYPES[type].label;
    return b;
  }

  // Baustein aus einem KI-Entwurf übernehmen: nur die Felder seines Typs.
  function normalize(raw) {
    if (!raw || !TYPES[raw.type]) return null;
    const b = blank(raw.type);
    for (const [key, kind] of TYPES[raw.type].fields) {
      const v = raw[key];
      if (v === undefined || v === null) continue;
      if (kind === "number") b[key] = Number(v) || 0;
      else if (kind === "bool") b[key] = !!v;
      else b[key] = v;
    }
    if (b.type === "auswahl") b.mehrfach = b.optionen.filter(o => o.richtig).length > 1;
    return b;
  }

  // Didaktisches Grundgerüst: Fall, Erklärung, Übung, Praxis, Check, Spickzettel.
  function scaffold(caseId) {
    return [
      blank("szenario", { title: "Ihr Auftrag", text: "Beschreiben Sie hier einen konkreten Arbeitsauftrag aus dem Alltag der Zielgruppe, mit Namen, Beträgen und Daten." }),
      blank("erklaerung", { title: "Das Wichtigste vorab", points: [{ head: "Kernpunkt 1", text: "" }, { head: "Kernpunkt 2", text: "" }, { head: "Kernpunkt 3", text: "" }] }),
      blank("auswahl", { title: "Kurz geprüft", optionen: [{ text: "", richtig: true, feedback: "" }, { text: "", richtig: false, feedback: "" }, { text: "", richtig: false, feedback: "" }] }),
      blank("erklaerung", { title: "So läuft es ab", points: [{ head: "Kernpunkt 1", text: "" }, { head: "Kernpunkt 2", text: "" }, { head: "Kernpunkt 3", text: "" }] }),
      blank("reihenfolge", { title: "Der Ablauf", schritte: ["", "", "", ""] }),
      blank("praxis", { title: "Jetzt sind Sie dran", caseId: caseId || "" }),
      blank("check", { title: "Wissenscheck", fragen: [] }),
      blank("spickzettel", { title: "Ihr Spickzettel", punkte: [] }),
    ];
  }

  // Hinweise für Autorin und Fachprüfung. level: "fehlt" verhindert die Prüfung, "hinweis" nur zur Info.
  function issues(course, cases = []) {
    const out = [];
    const blocks = course.blocks || [];
    if (!blocks.length) out.push({ level: "fehlt", text: "Die Lernstrecke hat noch keine Bausteine." });
    if (!blocks.some(b => b.type === "szenario")) out.push({ level: "hinweis", text: "Kein Szenario: Handlungsorientierte Lernstrecken beginnen mit einem Arbeitsauftrag." });
    blocks.forEach((b, i) => {
      const n = "Baustein " + (i + 1) + " (" + (TYPES[b.type]?.label || b.type) + ")";
      if (b.type === "erklaerung") {
        if (!b.quelle || /ergänzen/i.test(b.quelle)) out.push({ level: "hinweis", text: n + ": Quelle fehlt oder muss ergänzt werden." });
        if ((b.points || []).filter(p => p.head && p.text).length < 2) out.push({ level: "fehlt", text: n + ": mindestens zwei Kernpunkte mit Text." });
      }
      if (b.type === "auswahl" && !(b.optionen || []).some(o => o.richtig)) out.push({ level: "fehlt", text: n + ": keine Antwort als richtig markiert." });
      if (b.type === "auswahl" && (b.optionen || []).some(o => o.text && !o.feedback)) out.push({ level: "hinweis", text: n + ": Nicht jede Antwort hat ein Feedback." });
      if (b.type === "zuordnen" && (b.paare || []).filter(p => p.links && p.rechts).length < 2) out.push({ level: "fehlt", text: n + ": mindestens zwei vollständige Paare." });
      if (b.type === "reihenfolge" && (b.schritte || []).filter(Boolean).length < 3) out.push({ level: "fehlt", text: n + ": mindestens drei Schritte." });
      if (b.type === "praxis") {
        const c = cases.find(x => x.id === b.caseId);
        if (!c) out.push({ level: "fehlt", text: n + ": kein Case gewählt." });
        else if (c.status !== "freigegeben") out.push({ level: "hinweis", text: n + ": Der Case „" + c.title + "“ ist noch nicht freigegeben." });
      }
      if (b.type === "check") (b.fragen || []).forEach((q, k) => {
        if (!(q.optionen || []).some(o => o.richtig)) out.push({ level: "fehlt", text: n + ", Frage " + (k + 1) + ": keine richtige Antwort." });
      });
    });
    return out;
  }

  function videoId(course, block) {
    return "video-" + course.id + "-" + block.id;
  }

  // Grobe Bearbeitungszeit in Minuten.
  function estimate(course) {
    const per = { szenario: 1, erklaerung: 2.5, auswahl: 1, zuordnen: 1.5, rechnen: 1.5, reihenfolge: 1.5, praxis: 5, check: 2, spickzettel: 0.5 };
    return Math.max(1, Math.round((course.blocks || []).reduce((s, b) => s + (per[b.type] || 1), 0)));
  }

  // Für Spickzettel in der Wissensdatenbank.
  function cheatSheet(course) {
    const b = (course.blocks || []).find(x => x.type === "spickzettel");
    if (!b || !(b.punkte || []).filter(Boolean).length) return null;
    return {
      id: "spick-" + course.id,
      kind: "notiz",
      courseId: course.id,
      title: "Spickzettel: " + course.title,
      created: new Date().toISOString(),
      version: course.version || 1,
      text: "Aus der Lernstrecke „" + course.title + "“:\n" + b.punkte.filter(Boolean).map(p => "• " + p).join("\n"),
    };
  }

  window.AppilotKurs = { TYPES, blank, normalize, scaffold, issues, videoId, estimate, cheatSheet };
})();
