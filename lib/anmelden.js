// Anmeldeseite: anmelden oder über einen Einladungslink das Passwort festlegen.
// /anmelden?weiter=/lern-editor.html   – nach der Anmeldung dorthin zurück
// /anmelden?einladung=<token>          – Passwort festlegen
(function () {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const invite = params.get("einladung");
  // Nur Pfade auf dieser Seite, keine fremden Adressen.
  const next = (p => (p && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/anmelden") ? p : "/"))(params.get("weiter"));

  function msg(id, text) {
    $(id).textContent = text || "";
    $(id).hidden = !text;
  }
  function fail(text) {
    $("formLogin").hidden = true;
    $("formInvite").hidden = true;
    $("msgError").textContent = text;
    $("boxError").hidden = false;
  }
  async function call(method, body, query = "") {
    const res = await fetch("/api/auth" + query, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async function start() {
    // Einladungslink nicht im Verlauf oder in weitergegebenen Adressen stehen lassen.
    if (invite) history.replaceState(null, "", "/anmelden");
    if (invite) {
      const r = await call("GET", null, "?einladung=" + encodeURIComponent(invite));
      if (!r.ok) return fail(r.data.error || "Der Link funktioniert nicht.");
      $("inviteWho").textContent = `${r.data.name} · ${r.data.email}`;
      $("inviteEmail").value = r.data.email;
      $("formInvite").hidden = false;
      $("newPassword").focus();
      return;
    }
    const r = await call("GET");
    if (r.ok) return location.replace(next);
    if (r.status !== 401) return fail(r.data.error || "Die Anmeldung ist gerade nicht erreichbar.");
    $("formLogin").hidden = false;
    $("email").focus();
  }

  $("formLogin").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!email || !password) return msg("msgLogin", "Bitte E-Mail und Passwort eingeben.");
    $("btnLogin").disabled = true;
    msg("msgLogin", "");
    try {
      const r = await call("POST", { action: "login", email, password });
      if (r.ok) return location.replace(next);
      msg("msgLogin", r.data.error || "Anmeldung fehlgeschlagen.");
      $("password").value = "";
      $("password").focus();
    } catch {
      msg("msgLogin", "Keine Verbindung zum Server.");
    } finally {
      $("btnLogin").disabled = false;
    }
  });

  $("formInvite").addEventListener("submit", async e => {
    e.preventDefault();
    const password = $("newPassword").value;
    if (password.length < 12) return msg("msgInvite", "Das Passwort braucht mindestens 12 Zeichen.");
    if (password !== $("newPassword2").value) return msg("msgInvite", "Die beiden Passwörter sind nicht gleich.");
    $("btnInvite").disabled = true;
    msg("msgInvite", "");
    try {
      const r = await call("POST", { action: "invite", token: invite, password });
      if (r.ok) return location.replace("/");
      msg("msgInvite", r.data.error || "Das hat nicht geklappt.");
    } catch {
      msg("msgInvite", "Keine Verbindung zum Server.");
    } finally {
      $("btnInvite").disabled = false;
    }
  });

  start().catch(() => fail("Keine Verbindung zum Server."));
})();
