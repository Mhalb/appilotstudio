// Verbindung zur Datenbank (Postgres). Liegt unter api/_lib, damit Vercel daraus keine eigene Funktion macht.
// Die Adresse kommt aus DATABASE_URL (Neon über Vercel setzt sie von selbst) oder POSTGRES_URL.
// Die Tabellen legt ensureSchema() beim ersten Zugriff an; Änderungen nur abwärtskompatibel ("if not exists").
import postgres from "postgres";

let client = null;
let schemaReady = null;

export function hasDb() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function db() {
  if (client) return client;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL fehlt");
  // Wenige Verbindungen: jede Vercel-Funktion ist eine eigene Instanz. Neon verlangt TLS, lokal nicht unbedingt.
  client = postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
  return client;
}

export async function ensureSchema() {
  if (!schemaReady) {
    const sql = db();
    schemaReady = sql.begin(async tx => {
      await tx`create table if not exists users (
        id text primary key,
        email text not null unique,
        name text not null,
        role text not null check (role in ('autor', 'pruefer', 'admin')),
        password_hash text,
        active boolean not null default true,
        failed_logins integer not null default 0,
        locked_until timestamptz,
        created_at timestamptz not null default now()
      )`;
      await tx`create table if not exists sessions (
        token_hash text primary key,
        user_id text not null references users(id) on delete cascade,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      )`;
      await tx`create table if not exists invites (
        token_hash text primary key,
        user_id text not null references users(id) on delete cascade,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      )`;
    }).catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}
