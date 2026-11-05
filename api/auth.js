// /api/auth – Anmeldung
//   GET                                   ->  { user } oder 401
//   GET  ?einladung=<token>               ->  { email, name } für die Seite „Passwort festlegen“ oder 404
//   POST { action: "login", email, password }        ->  { user } und Sitzungs-Cookie
//   POST { action: "logout" }                        ->  { ok } und Cookie gelöscht
//   POST { action: "invite", token, password }       ->  { user } und Sitzungs-Cookie (Passwort über Einladung setzen)
// Läuft als Vercel-Funktion; lokal über server.mjs. Braucht DATABASE_URL.
import { hasDb } from "./_lib/db.js";
import {
  send, sameOrigin, sessionCookie, SESSION_HOURS,
  currentUser, login, endSession, findInvite, acceptInvite,
} from "./_lib/auth.js";

export default async function handler(req, res) {
  if (!hasDb()) return send(res, 503, { error: "Anmeldung nicht eingerichtet: DATABASE_URL fehlt" });
  if (!sameOrigin(req)) return send(res, 403, { error: "Anfrage von fremder Seite abgelehnt" });
  try {
    if (req.method === "GET") {
      const invite = new URL(req.url, "http://x").searchParams.get("einladung");
      if (invite) {
        const user = await findInvite(invite);
        return user ? send(res, 200, { email: user.email, name: user.name })
          : send(res, 404, { error: "Der Link ist abgelaufen oder wurde schon benutzt. Bitten Sie Ihren Admin um einen neuen." });
      }
      const user = await currentUser(req);
      return user ? send(res, 200, { user }) : send(res, 401, { error: "Bitte melden Sie sich an." });
    }
    if (req.method !== "POST") return send(res, 405, { error: "Nur GET oder POST" });

    const body = req.body || {};
    const maxAge = SESSION_HOURS * 3600;
    if (body.action === "login") {
      const r = await login(body.email, body.password);
      if (r.error) return send(res, 401, { error: r.error });
      return send(res, 200, { user: r.user }, { "Set-Cookie": sessionCookie(req, r.token, maxAge) });
    }
    if (body.action === "invite") {
      const r = await acceptInvite(body.token, body.password);
      if (r.error) return send(res, 400, { error: r.error });
      return send(res, 200, { user: r.user }, { "Set-Cookie": sessionCookie(req, r.token, maxAge) });
    }
    if (body.action === "logout") {
      await endSession(req);
      return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
    }
    return send(res, 400, { error: "action muss login, logout oder invite sein" });
  } catch (err) {
    console.error("Anmeldung", err);
    return send(res, 503, { error: "Anmeldung gerade nicht erreichbar" });
  }
}
