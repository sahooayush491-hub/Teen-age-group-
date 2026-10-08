import {
  getSql,
  readCookie,
  sessionCookie,
  SESSION_COOKIE,
  json,
} from "../../lib/db.mjs";

export const config = { path: "/api/logout" };

export default async function logout(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const token = readCookie(request, SESSION_COOKIE);
  try {
    if (token) {
      const sql = getSql();
      await sql`DELETE FROM sessions WHERE token = ${token}`;
    }
  } catch (err) {
    console.error("logout error:", err);
    // still clear the cookie below
  }

  return json({ ok: true }, 200, {
    "Set-Cookie": sessionCookie(SESSION_COOKIE, "", request, 0),
  });
}
