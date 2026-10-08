import {
  getSql,
  ensureSchema,
  verifyPassword,
  newToken,
  sessionCookie,
  SESSION_COOKIE,
  json,
} from "../../lib/db.mjs";

export const config = { path: "/api/login" };

export default async function login(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body = {};
  try { body = await request.json(); } catch (e) { /* empty body */ }

  const id = String(body.identifier || "").trim().toLowerCase();
  const password = String(body.password || "");

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = await sql`
      SELECT id, username, email, password_hash
      FROM users
      WHERE lower(username) = ${id} OR lower(email) = ${id}
      LIMIT 1
    `;
    const user = rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return json({ ok: false, error: "Wrong username/email or password." }, 401);
    }

    const token = newToken();
    await sql`INSERT INTO sessions (token, user_id) VALUES (${token}, ${user.id})`;

    return json(
      { ok: true, username: user.username },
      200,
      { "Set-Cookie": sessionCookie(SESSION_COOKIE, token, request, 60 * 60 * 24 * 30) }
    );
  } catch (err) {
    console.error("login error:", err);
    return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}
