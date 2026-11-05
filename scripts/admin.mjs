// Nutzer anlegen oder neuen Einladungslink erzeugen – vor allem für den ersten Admin.
//
//   node scripts/admin.mjs <email> "<Name>" [rolle]
//
// rolle: admin (Standard), autor oder pruefer. Gibt es die E-Mail schon, bleibt der Nutzer und bekommt einen neuen
// Link (so setzt ein Admin auch ein vergessenes Passwort zurück). Der Link gilt 7 Tage und nur einmal.
// Braucht DATABASE_URL (aus .env oder Umgebung). Die Adresse im Link kommt aus APP_URL, sonst http://localhost:3000.
try { process.loadEnvFile(); } catch { /* ohne .env: Umgebungsvariablen genügen */ }
const { db, ensureSchema } = await import("../api/_lib/db.js");
const { createInvite, newId, normEmail, ROLES, INVITE_DAYS } = await import("../api/_lib/auth.js");

const [emailArg, nameArg, roleArg = "admin"] = process.argv.slice(2);
const email = normEmail(emailArg);
if (!email || !email.includes("@") || !nameArg || !ROLES.includes(roleArg)) {
  console.error('Aufruf: node scripts/admin.mjs <email> "<Name>" [admin|autor|pruefer]');
  process.exit(1);
}

const sql = db();
try {
  await ensureSchema();
  let [user] = await sql`select id, name, role from users where email = ${email}`;
  if (user) {
    console.log(`${email} gibt es schon (${user.name}, ${user.role}). Neuer Einladungslink:`);
  } else {
    [user] = await sql`insert into users (id, email, name, role) values (${newId("u")}, ${email}, ${nameArg.trim().slice(0, 120)}, ${roleArg})
                       returning id, name, role`;
    console.log(`Angelegt: ${user.name} <${email}>, Rolle ${user.role}. Einladungslink:`);
  }
  const token = await createInvite(user.id);
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log(`\n  ${base}/anmelden?einladung=${token}\n\nGilt ${INVITE_DAYS} Tage und nur einmal. Nur an die Person selbst weitergeben.`);
} finally {
  await sql.end();
}
