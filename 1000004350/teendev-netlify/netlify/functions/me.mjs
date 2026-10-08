import { ensureSchema, currentUser, json } from "../../lib/db.mjs";

export const config = { path: "/api/me" };

export default async function me(request) {
  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    await ensureSchema();
    const user = await currentUser(request);
    if (!user) return json({ ok: false, error: "Not logged in" }, 401);

    return json({
      ok: true,
      username: user.username,
      email: user.email,
      bio: user.bio || "",
      joined: new Date(user.created_at).toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("me error:", err);
    return json({ ok: false, error: "Something went wrong." }, 500);
  }
}
