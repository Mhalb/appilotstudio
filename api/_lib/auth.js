// Anmeldung: Passwörter, Sitzungen, Einladungen. Nur für Serverfunktionen.
//
// - Passwörter: scrypt aus node:crypto, mit zufälligem Salz. Gespeichert als "scrypt$<salz>$<hash>".
// - Sitzung: zufälliges Token im Cookie (HttpOnly, SameSite=Lax, Secure bei HTTPS), 12 Stunden gültig.
//   In der Datenbank liegt nur der SHA-256-Hash des Tokens.
// - Einladung: einmaliger Link, 7 Tage gültig, ebenfalls nur als Hash gespeichert.
// - Nach MAX_FAILS Fehlversuchen ist das Konto LOCK_MINUTES gesperrt.
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { db, ensureSchema, hasDb } from "./db.js";

const scryptAsync = promisify(scrypt);
export const COOKIE = "appilot_session";
export const SESSION_HOURS = 12;
export const INVITE_DAYS = 7;
export const MIN_PASSWORD = 12;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const KEYLEN = 64;
export const ROLES = ["autor", "pruefer", "admin"];

export const newId = prefix => prefix + "-" + randomBytes(9).toString("base64url");
const newToken = () => randomBytes(32).toString("base64url");
const hashToken = token => createHash("sha256").update(String(token)).digest("hex");
export const normEmail = email => String(email || "").trim().toLowerCase();

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(String(password), salt, KEYLEN);
  return "scrypt$" + salt.toString("base64") + "$" + hash.toString("base64");
}

export async function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) {
    // Gleich viel Rechenzeit, damit man an der Antwortzeit nicht erkennt, ob es das Konto gibt.
    await scryptAsync(String(password), "appilot-dummy-salt", KEYLEN);
    return false;
  }
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(String(password), Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

export function checkPassword(password) {
  const p = String(password || "");
  if (p.length < MIN_PASSWORD) return `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`;
  if (p.length > 200) return "Das Passwort ist zu lang.";
  return null;
}

// ---------------------------------------------------------------------------
// HTTP-Helfer
// ---------------------------------------------------------------------------
export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const isHttps = req => (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https" || Boolean(req.socket && req.socket.encrypted);

export function sessionCookie(req, token, maxAgeSeconds) {
  return [
    `${COOKIE}=${token ? encodeURIComponent(token) : ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    isHttps(req) ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

// Schreibende Anfragen nur von der eigenen Seite (zusätzlich zu SameSite=Lax).
export function sameOrigin(req) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.origin;
  if (!origin) return true; // z. B. curl oder ältere Browser; das Cookie ist trotzdem SameSite=Lax
  try { return new URL(origin).host === (req.headers["x-forwarded-host"] || req.headers.host); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Sitzungen
// ---------------------------------------------------------------------------
export async function createSession(userId) {
  const sql = db();
  const token = newToken();
  await sql`delete from sessions where expires_at < now()`;
  await sql`insert into sessions (token_hash, user_id, expires_at)
            values (${hashToken(token)}, ${userId}, now() + make_interval(hours => ${SESSION_HOURS}))`;
  return token;
}

export async function endSession(req) {
  const token = readCookie(req, COOKIE);
  if (token) await db()`delete from sessions where token_hash = ${hashToken(token)}`;
}

const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role });

export async function currentUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  await ensureSchema();
  const [u] = await db()`
    select u.id, u.email, u.name, u.role from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now() and u.active`;
  return u ? publicUser(u) : null;
}

// Für alle geschützten Schnittstellen: liefert den Nutzer oder antwortet selbst mit 401/403/503.
export async function requireUser(req, res, roles) {
  if (!hasDb()) { send(res, 503, { error: "Anmeldung nicht eingerichtet: DATABASE_URL fehlt" }); return null; }
  if (!sameOrigin(req)) { send(res, 403, { error: "Anfrage von fremder Seite abgelehnt" }); return null; }
  let user;
  try { user = await currentUser(req); } catch (err) {
    console.error("Anmeldung", err);
    send(res, 503, { error: "Anmeldung gerade nicht erreichbar" });
    return null;
  }
  if (!user) { send(res, 401, { error: "Bitte melden Sie sich an." }); return null; }
  if (roles && !roles.includes(user.role)) { send(res, 403, { error: "Dafür fehlt Ihnen die Berechtigung." }); return null; }
  return user;
}

// ---------------------------------------------------------------------------
// Anmelden
// ---------------------------------------------------------------------------
const WRONG = "E-Mail oder Passwort stimmt nicht.";

export async function login(email, password) {
  await ensureSchema();
  const sql = db();
  const [u] = await sql`select * from users where email = ${normEmail(email)}`;
  if (u && u.locked_until && new Date(u.locked_until) > new Date()) {
    return { error: `Zu viele Fehlversuche. Bitte warten Sie ${LOCK_MINUTES} Minuten.` };
  }
  const ok = await verifyPassword(password, u && u.active ? u.password_hash : null);
  if (!u || !u.active || !ok) {
    if (u) {
      await sql`update users set
        failed_logins = case when failed_logins + 1 >= ${MAX_FAILS} then 0 else failed_logins + 1 end,
        locked_until = case when failed_logins + 1 >= ${MAX_FAILS} then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end
        where id = ${u.id}`;
    }
    return { error: WRONG };
  }
  await sql`update users set failed_logins = 0, locked_until = null where id = ${u.id}`;
  return { user: publicUser(u), token: await createSession(u.id) };
}

// ---------------------------------------------------------------------------
// Einladungen
// ---------------------------------------------------------------------------
export async function createInvite(userId) {
  const sql = db();
  const token = newToken();
  await sql`delete from invites where user_id = ${userId} or expires_at < now()`;
  await sql`insert into invites (token_hash, user_id, expires_at)
            values (${hashToken(token)}, ${userId}, now() + make_interval(days => ${INVITE_DAYS}))`;
  return token;
}

export async function findInvite(token) {
  if (!token) return null;
  await ensureSchema();
  const [row] = await db()`
    select u.id, u.email, u.name, u.role from invites i join users u on u.id = i.user_id
    where i.token_hash = ${hashToken(token)} and i.expires_at > now() and u.active`;
  return row ? publicUser(row) : null;
}

// Passwort über den Einladungslink setzen. Alte Sitzungen enden, der Link verfällt, der Nutzer ist angemeldet.
export async function acceptInvite(token, password) {
  const problem = checkPassword(password);
  if (problem) return { error: problem };
  const user = await findInvite(token);
  if (!user) return { error: "Der Link ist abgelaufen oder wurde schon benutzt. Bitten Sie Ihren Admin um einen neuen." };
  const hash = await hashPassword(password);
  const sql = db();
  await sql.begin(async tx => {
    await tx`update users set password_hash = ${hash}, failed_logins = 0, locked_until = null where id = ${user.id}`;
    await tx`delete from invites where user_id = ${user.id}`;
    await tx`delete from sessions where user_id = ${user.id}`;
  });
  return { user, token: await createSession(user.id) };
}
