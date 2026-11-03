// Sprachfassungen für Appilot: Deutsch, Einfache Sprache und Englisch. Genutzt von Appilot, Case-Editor und Lernseite.
(function () {
  const LANGS = { de: "Deutsch", einfach: "Einfache Sprache", en: "English" };
  const SHORT = { de: "Deutsch", einfach: "Einfach", en: "English" };
  const KEY = "appilot-lang";

  function get() {
    try { const l = localStorage.getItem(KEY); return LANGS[l] ? l : "de"; } catch { return "de"; }
  }
  function set(lang) {
    try { localStorage.setItem(KEY, LANGS[lang] ? lang : "de"); } catch {}
  }

  // Fingerabdruck der deutschen Texte. Eine Sprachfassung gilt nur, solange sich die Vorlage nicht geändert hat.
  function source(c) {
    const s = JSON.stringify([c.title, c.description, (c.steps || []).map(x => [x.title, x.text]), (c.errors || []).map(x => [x.title, x.text])]);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }
  // Gültige Sprachfassung eines Case oder null.
  function version(c, lang) {
    const t = c && c.translations && c.translations[lang];
    return t && t.source === source(c) && (t.steps || []).length === (c.steps || []).length ? t : null;
  }
  // Case in der gewünschten Sprache: Texte ersetzt, Bedienschritte unverändert.
  function localize(c, lang) {
    if (lang === "de") return c;
    const t = version(c, lang);
    if (!t) return null;
    return Object.assign({}, c, {
      title: t.title || c.title,
      description: t.description || c.description,
      steps: c.steps.map((s, i) => Object.assign({}, s, { title: t.steps[i].title || s.title, text: t.steps[i].text || s.text })),
      errors: (c.errors || []).map((e, i) => Object.assign({}, e, (t.errors || [])[i] || {})),
    });
  }

  window.AppilotSprache = { LANGS, SHORT, get, set, source, version, localize };
})();
