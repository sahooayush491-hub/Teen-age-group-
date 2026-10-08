import { getSql, ensureSchema, currentUser, json } from "../../lib/db.mjs";

export const config = { path: "/api/profile" };

export default async function profile(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body = {};
  try { body = await request.json(); } catch (e) { /* empty body */ }

  try {
    await ensureSchema();
    const user = await currentUser(request);
    if (!user) return json({ ok: false, error: "Not logged in" }, 401);

    const clean = String(body.bio || "").trim().slice(0, 280);
    const sql = getSql();
    await sql`UPDATE users SET bio = ${clean} WHERE id = ${user.id}`;

    return json({ ok: true, bio: clean });
  } catch (err) {
    console.error("profile error:", err);
    return json({ ok: false, error: "Something went wrong." }, 500);
  }
}
