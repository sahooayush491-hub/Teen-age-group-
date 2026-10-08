import { getSql, ensureSchema, hashPassword, json } from "../../lib/db.mjs";

export const config = { path: "/api/register" };

export default async function register(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body = {};
  try { body = await request.json(); } catch (e) { /* empty body */ }

  const uname = String(body.username || "").trim();
  const mail = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (uname.length < 3) return json({ ok: false, error: "Username must be at least 3 characters." }, 400);
  if (!mail.includes("@") || !mail.includes(".")) return json({ ok: false, error: "Please enter a valid email address." }, 400);
  if (password.length < 8) return json({ ok: false, error: "Password must be at least 8 characters." }, 400);

  try {
    await ensureSchema();
    const sql = getSql();

    const existing = await sql`
      SELECT 1 FROM users
      WHERE lower(username) = ${uname.toLowerCase()} OR lower(email) = ${mail}
      LIMIT 1
    `;
    if (existing.length) {
      return json({ ok: false, error: "That username or email is already registered." }, 409);
    }

    await sql`
      INSERT INTO users (username, email, password_hash)
      VALUES (${uname}, ${mail}, ${hashPassword(password)})
    `;

    return json({ ok: true });
  } catch (err) {
    console.error("register error:", err);
    return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}
