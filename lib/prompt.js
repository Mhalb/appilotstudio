// Anweisungen und Antwortformate für Appilot im Studio.
// Aufgaben: draft (Case aus einer Beschreibung), polish (Texte für einen aufgenommenen Case), course (Lernstrecke
// entwerfen), tutor (Rückfragen beim Lernen), translate (Sprachfassungen eines Case).
// Name der Zielanwendung und Zielgruppe kommen aus den Projekteinstellungen (cleanProject).

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,60}$/;
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const ACTIONS = ["click", "input", "select", "check", "upload", "info"];

// ---------- Eingaben prüfen ----------

export function cleanControls(list, max = 120) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(c => c && ID.test(c.id))
    .slice(0, max)
    .map(c => ({
      id: c.id,
      type: str(c.type, 20),
      label: str(c.label, 80),
      screen: str(c.screen, 60),
      required: !!c.required,
      visible: !!c.visible,
      hint: str(c.hint, 300),
      value: str(c.value, 120),
      message: str(c.message, 200),
      options: Array.isArray(c.options) ? c.options.slice(0, 12).map(o => ({ value: str(o?.value, 40), text: str(o?.text, 80) })) : undefined,
    }));
}

export function cleanScreens(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(s => s && ID.test(s.id)).slice(0, 30).map(s => ({ id: s.id, title: str(s.title, 80) }));
}

// Projekt: Name der Zielanwendung und Zielgruppe der Lernstrecken
export function cleanProject(p) {
  return {
    app: str(p?.app, 80).trim() || "die Zielanwendung",
    audience: str(p?.audience, 300).trim() || "Beschäftigte, die die Anwendung im Arbeitsalltag nutzen",
  };
}

export function cleanRecorded(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 60).map(s => ({
    target: ID.test(s?.target) ? s.target : "",
    action: ACTIONS.includes(s?.action) ? s.action : "info",
    value: str(String(s?.value ?? ""), 120),
    valueText: str(s?.valueText, 120),
    label: str(s?.label, 80),
    screen: str(s?.screen, 80),
    hint: str(s?.hint, 300),
    title: str(s?.title, 120),
  }));
}

// Sprachwahl der Lernenden. Die Anwendung selbst bleibt in ihrer Sprache; Appilot baut die Brücke.
export const LANG_RULES = {
  einfach: `SPRACHE: Einfache Sprache. Die Person hat Einfache Sprache gewählt. Antworte auf Deutsch in Einfacher Sprache, auch in "chips":
- kurze Sätze mit höchstens 12 Wörtern, ein Gedanke pro Satz
- Sie-Form, aktiv statt passiv, keine Abkürzungen, keine Schachtelsätze
- Fachwörter vermeiden oder beim ersten Mal in einem kurzen Satz erklären
- Feld- und Buttonnamen der Anwendung genau so nennen, wie sie auf dem Bildschirm stehen, in „…“`,
  en: `LANGUAGE: The person has chosen English. Answer in English, including "chips", even if the question is in German.
- The application itself is in German. Quote field and button names exactly as shown on screen, in German, in „…“, and add a short English explanation in parentheses on first mention, e.g. „Speichern“ (save).
- Explain German domain terms briefly instead of only translating them.`,
};
export const cleanLang = l => (LANG_RULES[l] ? l : "de");

// ---------- draft ----------

export const draftSystem = ({ app }) => `Du erstellst für Appilot einen Case: einen Arbeitsablauf in der Web-Anwendung „${app}“, Schritt für Schritt.
Du bekommst eine Beschreibung des Ablaufs in eigenen Worten und die Karte der Anwendung (Masken und Bedienelemente mit id, Beschriftung, Optionen und Feldhilfe).

Regeln:
- Der Case beginnt auf der Startseite der Anwendung und muss in genau dieser Reihenfolge in der Anwendung durchspielbar sein.
- Jeder Schritt bedient genau ein Bedienelement über seine id ("target"). Nutze nur ids aus der Karte.
- action: "click" für Kacheln, Buttons und Links; "select" für Auswahllisten; "input" für Texteingaben und Datumsfelder; "check" für Checkboxen und Optionsfelder; "upload" für Buttons mit Datei hinzufügen.
- Zwischen den Masken braucht es einen Schritt auf den Weiter-Button. Pflichtfelder einer Maske müssen vorher gefüllt sein, sonst blockiert die Anwendung.
- "value": bei select der value einer Option aus der Karte, bei input ein realistischer Beispielwert (Datum als JJJJ-MM-TT), bei check "true", sonst "".
- Wähle Beispielwerte, die die Prüfungen der Anwendung bestehen (z. B. gültige Formate, erlaubte Auswahlwerte, plausible Beträge), es sei denn, die Beschreibung verlangt etwas anderes.
- "title": kurze Handlung im Imperativ, z. B. "Kunde wählen". "text": 1 bis 2 Sätze in der Sie-Form, was zu tun ist und worauf zu achten ist. Nutze dafür die Feldhilfe.
- "errors": typische Fehlerbilder dieses Ablaufs mit kurzer Erklärung und Lösung, aus der Beschreibung und der Feldhilfe abgeleitet.`;

export function draftSchema(controls) {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            target: { type: "string", enum: controls.map(c => c.id) },
            action: { type: "string", enum: ACTIONS },
            value: { type: "string" },
            title: { type: "string" },
            text: { type: "string" },
          },
          required: ["target", "action", "value", "title", "text"],
          additionalProperties: false,
        },
      },
      errors: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, text: { type: "string" } },
          required: ["title", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "description", "steps", "errors"],
    additionalProperties: false,
  };
}

// ---------- polish ----------

export const polishSystem = ({ app }) => `Ein Autor hat in der Web-Anwendung „${app}“ einen Arbeitsablauf aufgenommen. Du bekommst die aufgezeichneten Schritte (Bedienelement, Aktion, Wert, Beschriftung, Feldhilfe, Maske).
Formuliere daraus einen Case für die In-App-Hilfe und für Schulungsvideos:
- "title" und "description" für den ganzen Case. Wenn der Autor eine Beschreibung mitgibt, richte dich danach.
- Für jeden aufgezeichneten Schritt genau einen Eintrag in "steps", in derselben Reihenfolge: "title" als kurze Handlung im Imperativ, "text" mit 1 bis 2 Sätzen in der Sie-Form, was zu tun ist und worauf zu achten ist. Nutze die Feldhilfe. Nenne konkrete Beispielwerte nur, wenn sie für das Verständnis helfen.
- "errors": typische Fehlerbilder dieses Ablaufs mit kurzer Erklärung und Lösung, aus der Feldhilfe abgeleitet.`;

export const POLISH_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, text: { type: "string" } },
        required: ["title", "text"],
        additionalProperties: false,
      },
    },
    errors: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, text: { type: "string" } },
        required: ["title", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "description", "steps", "errors"],
  additionalProperties: false,
};

// ---------- course (Lernstrecke entwerfen) ----------

export const BLOCK_TYPES = ["szenario", "erklaerung", "auswahl", "zuordnen", "rechnen", "reihenfolge", "praxis", "check", "spickzettel"];

export function cleanCaseRefs(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(c => c && ID.test(c.id)).slice(0, 20).map(c => ({ id: c.id, title: str(c.title, 120), description: str(c.description, 300) }));
}

export const courseSystem = ({ app, audience }) => `Du entwirfst eine interaktive Lernstrecke zur Arbeit mit der Anwendung „${app}“. Zielgruppe: ${audience}.
Didaktik: handlungsorientiert und fallbasiert. Die Lernenden lösen einen konkreten Arbeitsauftrag; Theorie kommt nur, wenn sie für den nächsten Schritt gebraucht wird.

Aufbau, als Folge von Bausteinen ("blocks"):
1. Ein "szenario" am Anfang: ein realistischer Arbeitsauftrag in der Du-Perspektive einer Kollegin, erzählt in der Sie-Form an die lernende Person, 2 bis 4 Sätze, mit konkreten Namen, Beträgen und Daten.
2. Abwechselnd "erklaerung" und eine Übung. Jede Erklärung hat 3 bis 4 Kernpunkte ("points": head = kurze Aussage, text = 1 bis 2 Sätze), einen "merksatz" und eine "quelle" (Regelwerk, Handbuch oder interne Vorgabe, so genau wie möglich; wenn du unsicher bist, schreibe "bitte durch Fachabteilung ergänzen").
3. Übungen: "auswahl" (eine Frage, 3 Optionen mit je eigenem Feedback, das erklärt, warum die Antwort richtig oder falsch ist), "zuordnen" (3 bis 5 Paare Begriff und Bedeutung), "rechnen" (Rechenaufgabe aus dem Szenario mit "loesung" als Zahl, "einheit", "hinweis" und "erklaerung" des Rechenwegs), "reihenfolge" (4 bis 6 Schritte in der richtigen Reihenfolge).
4. Wenn ein passender Case aus der Liste existiert, ein "praxis"-Baustein mit dessen "caseId": Die Lernenden wenden das Gelernte in der echten Anwendung an, Appilot führt sie.
5. Ein "check" mit 3 Fragen ("fragen", je 3 Optionen, genau eine richtig, kurze "erklaerung").
6. Ein "spickzettel" am Ende mit 5 bis 7 kurzen Merksätzen ("punkte").

Regeln:
- Gehe davon aus, dass die Lernenden kein Vorwissen haben, wenn der Autor nichts anderes angibt. Erkläre Fachbegriffe beim ersten Auftreten in einfachen Worten. Kurze Sätze, Sie-Form.
- Nutze die Quellen und Stichworte des Autors. Erfinde keine Regeln oder Paragraphen; wenn eine Grundlage unklar ist, sag es in "quelle".
- Fülle in jedem Baustein nur die Felder, die zu seinem Typ gehören; alle anderen Felder bleiben leer ("" bzw. [] bzw. 0 bzw. false).
- "minutes": realistische Bearbeitungszeit der ganzen Lernstrecke.`;

const optionSchema = {
  type: "object",
  properties: { text: { type: "string" }, richtig: { type: "boolean" }, feedback: { type: "string" } },
  required: ["text", "richtig", "feedback"],
  additionalProperties: false,
};

export function courseSchema(cases) {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      goal: { type: "string" },
      minutes: { type: "integer" },
      blocks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: BLOCK_TYPES },
            title: { type: "string" },
            text: { type: "string" },
            points: {
              type: "array",
              items: { type: "object", properties: { head: { type: "string" }, text: { type: "string" } }, required: ["head", "text"], additionalProperties: false },
            },
            merksatz: { type: "string" },
            quelle: { type: "string" },
            frage: { type: "string" },
            optionen: { type: "array", items: optionSchema },
            paare: {
              type: "array",
              items: { type: "object", properties: { links: { type: "string" }, rechts: { type: "string" } }, required: ["links", "rechts"], additionalProperties: false },
            },
            schritte: { type: "array", items: { type: "string" } },
            loesung: { type: "number" },
            einheit: { type: "string" },
            hinweis: { type: "string" },
            erklaerung: { type: "string" },
            caseId: { type: "string", enum: ["", ...cases.map(c => c.id)] },
            fragen: {
              type: "array",
              items: {
                type: "object",
                properties: { frage: { type: "string" }, optionen: { type: "array", items: optionSchema }, erklaerung: { type: "string" } },
                required: ["frage", "optionen", "erklaerung"],
                additionalProperties: false,
              },
            },
            punkte: { type: "array", items: { type: "string" } },
          },
          required: ["type", "title", "text", "points", "merksatz", "quelle", "frage", "optionen", "paare", "schritte", "loesung", "einheit", "hinweis", "erklaerung", "caseId", "fragen", "punkte"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "goal", "minutes", "blocks"],
    additionalProperties: false,
  };
}

// ---------- tutor (Rückfragen in einer Lernstrecke) ----------

export function cleanCourseForTutor(course) {
  if (!course || typeof course !== "object") return null;
  const blocks = Array.isArray(course.blocks) ? course.blocks.slice(0, 30) : [];
  return {
    title: str(course.title, 160),
    goal: str(course.goal, 400),
    blocks: blocks.map(b => ({
      type: str(b?.type, 20),
      title: str(b?.title, 160),
      text: str(b?.text, 800),
      points: Array.isArray(b?.points) ? b.points.slice(0, 6).map(p => str(p?.head, 120) + ": " + str(p?.text, 300)) : [],
      merksatz: str(b?.merksatz, 300),
      quelle: str(b?.quelle, 200),
    })).filter(b => b.title),
  };
}

const tutorSystem = ({ app, audience }) => `Du bist Appilot, der Lernbegleiter in einer Lernstrecke zur Anwendung „${app}“. Zielgruppe: ${audience}.
Beantworte Rückfragen der lernenden Person kurz (2 bis 5 Sätze), freundlich, in der Sie-Form und in einfachen Worten, wie für Einsteiger ohne Vorwissen.
Stütze dich auf den Inhalt der Lernstrecke. Wenn die Frage darüber hinausgeht, antworte allgemein und weise darauf hin, dass die zuständige Fachabteilung verbindlich Auskunft gibt.
Verrate bei Übungsfragen nicht direkt die Lösung, sondern gib einen Denkanstoß.`;

export function buildTutor({ course, current, lang = "de", project }) {
  const parts = [tutorSystem(project)];
  if (LANG_RULES[lang]) parts.push(LANG_RULES[lang].replace(/, (auch|including) in "chips"|, including "chips"/, ""));
  if (course) parts.push("LERNSTRECKE\n" + JSON.stringify(course));
  if (current) parts.push("DIE PERSON IST GERADE BEI: " + current);
  return parts.join("\n\n");
}

export const TUTOR_SCHEMA = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
  additionalProperties: false,
};

// ---------- translate (Sprachfassungen eines Case) ----------

export const translateSystem = (lang, { app }) => ({
  einfach: `Du schreibst die Texte eines Case zur Anwendung „${app}“ für die Hilfe Appilot in Einfache Sprache um. Nutzer sind Menschen, die Einfache Sprache gewählt haben, etwa wegen Leseschwierigkeiten oder geringer Deutschkenntnisse.
Regeln:
- kurze Sätze mit höchstens 12 Wörtern, ein Gedanke pro Satz, Sie-Form, aktiv statt passiv
- keine Abkürzungen, keine Schachtelsätze, Zahlen als Ziffern
- Fachwörter vermeiden oder in einem kurzen Satz erklären, was sie bedeuten
- Feld- und Buttonnamen der Anwendung genau so lassen, wie sie auf dem Bildschirm stehen, in „…“
- nichts weglassen, was für die Handlung wichtig ist, und nichts erfinden
- "title" eines Schritts ist eine kurze Handlung, "text" 1 bis 4 kurze Sätze
Gib für jeden Schritt und jedes Fehlerbild genau einen Eintrag in derselben Reihenfolge zurück.`,
  en: `You translate the texts of a guided case for the application „${app}“ and the help Appilot into English for users who prefer English.
Rules:
- clear, friendly, plain English; address the user directly
- the application stays in German: keep field and button names exactly as shown on screen, in German, in „…“, and add a short English explanation in parentheses on first mention, e.g. „Speichern“ (save)
- explain German domain terms briefly instead of only translating them; keep amounts and formats
- do not leave out anything needed for the task and do not invent anything
Return exactly one entry per step and per error, in the same order.`,
})[lang];

export const TRANSLATE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    steps: POLISH_SCHEMA.properties.steps,
    errors: POLISH_SCHEMA.properties.errors,
  },
  required: ["title", "description", "steps", "errors"],
  additionalProperties: false,
};

export function cleanTexts(body) {
  const pair = x => ({ title: str(x?.title, 200), text: str(x?.text, 1200) });
  return {
    title: str(body?.title, 200),
    description: str(body?.description, 2000),
    steps: Array.isArray(body?.steps) ? body.steps.slice(0, 80).map(pair) : [],
    errors: Array.isArray(body?.errors) ? body.errors.slice(0, 30).map(pair) : [],
  };
}
