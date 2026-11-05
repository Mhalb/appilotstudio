// Schutz der Studio-Seiten: wird im <head> jeder Seite geladen, vor allen anderen Skripten.
// Ohne gültige Sitzung geht es zur Anmeldung. Die eigentliche Prüfung machen die Serverfunktionen;
// diese Datei sorgt nur dafür, dass niemand ohne Anmeldung eine leere Oberfläche sieht.
//
//   AppilotAuth.ready   Promise mit { id, email, name, role } des angemeldeten Nutzers
//   AppilotAuth.logout()
(function () {
  const root = document.documentElement;
  root.style.visibility = "hidden";

  const toLogin = () => {
    location.replace("/anmelden?weiter=" + encodeURIComponent(location.pathname + location.search + location.hash));
    return new Promise(() => {}); // Seite wird gleich verlassen
  };

  const ready = fetch("/api/auth", { credentials: "same-origin", cache: "no-store" }).then(async res => {
    if (res.status === 401) return toLogin();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Die Anmeldung ist gerade nicht erreichbar.");
    return data.user;
  });

  async function logout() {
    try {
      await fetch("/api/auth", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    } finally {
      location.replace("/anmelden");
    }
  }

  // Läuft eine Sitzung während der Arbeit ab, liefern die Serverfunktionen 401: dann zur Anmeldung.
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    const url = String(args[0] && args[0].url || args[0]);
    if (res.status === 401 && url.startsWith("/api/") && !url.startsWith("/api/auth")) toLogin();
    return res;
  };

  const ROLE = { autor: "Autor/in", pruefer: "Prüfer/in", admin: "Admin" };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  function showUser(user) {
    const header = document.querySelector("header.top");
    if (!header || header.querySelector(".who")) return;
    const box = document.createElement("span");
    box.className = "who";
    const label = `${user.name} · ${ROLE[user.role] || user.role}`;
    box.title = label;
    box.innerHTML = `<span class="who-name"><b>${esc(user.name)}</b> · ${esc(ROLE[user.role] || user.role)}</span>` +
      `<button type="button" aria-label="Abmelden (${esc(label)})"><span class="who-long">Abmelden</span><span class="who-short" aria-hidden="true">⏻</span></button>`;
    box.querySelector("button").addEventListener("click", logout);
    header.append(box);
  }

  function showError(text) {
    const box = document.createElement("div");
    box.className = "auth-fail";
    box.setAttribute("role", "alert");
    box.innerHTML = `<div><p>${esc(text)}</p><p><a href="/anmelden">Zur Anmeldung</a></p></div>`;
    document.body.append(box);
  }

  // Eigene Stile, weil die Seiten verschiedene Stylesheets laden (editor.css, lernen.css).
  const style = document.createElement("style");
  style.textContent = `
    .who { display: flex; align-items: center; gap: 10px; color: #cfe3ff; font-size: 13px; white-space: nowrap; }
    .who b { color: #fff; font-weight: 600; }
    .who button { color: #cfe3ff; background: none; border: 0; cursor: pointer; font: inherit; padding: 0; }
    .who button:hover { text-decoration: underline; }
    .who-name { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
    .who-short { display: none; font-size: 15px; }
    @media (max-width: 1280px) {
      .who-name, .who-long { display: none; }
      .who-short { display: inline; }
    }
    .auth-fail { position: fixed; inset: 0; z-index: 10000; display: grid; place-content: center; background: #0b1f33; color: #fff;
      font: 15px/1.5 system-ui, sans-serif; text-align: center; padding: 24px; visibility: visible; }
    .auth-fail a { color: #2bd4a5; }`;
  document.head.append(style);

  const domReady = new Promise(r => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", r, { once: true }) : r());
  Promise.all([ready, domReady]).then(([user]) => {
    showUser(user);
    root.style.visibility = "";
  }, err => domReady.then(() => showError(err.message)));

  window.AppilotAuth = { ready, logout };
})();
