/**
 * Local test for the backend functions, run against a real Postgres engine
 * (PGlite). Verifies the SQL, password hashing, sessions and cookies work
 * before you deploy.  Run with:  npm test
 */
import { PGlite } from "@electric-sql/pglite";
import { __setSqlForTesting } from "../lib/db.mjs";

import register from "../netlify/functions/register.mjs";
import login from "../netlify/functions/login.mjs";
import logout from "../netlify/functions/logout.mjs";
import me from "../netlify/functions/me.mjs";
import profile from "../netlify/functions/profile.mjs";

/* ---- wire PGlite up as the sql tagged-template function ------------------ */
const pg = new PGlite();
const sql = async (strings, ...values) => {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += "$" + (i + 1) + strings[i + 1];
  const res = await pg.query(text, values);
  return res.rows;
};
__setSqlForTesting(sql);

/* ---- tiny request mock (Netlify passes a real Request in production) ----- */
function req(path, { method = "GET", body = null, cookie = null } = {}) {
  const h = new Map();
  if (cookie) h.set("cookie", cookie);
  return {
    method,
    url: "https://example.com" + path,
    headers: { get: (k) => (h.has(String(k).toLowerCase()) ? h.get(String(k).toLowerCase()) : null) },
    json: async () => (body ? body : {}),
  };
}
const send = (handler, opts) => handler(req("/api/x", opts));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("  \u2713 " + name); }
  else { fail++; console.log("  \u2717 " + name + "  " + extra); }
}
const data = async (res) => { try { return await res.json(); } catch (e) { return {}; } };

console.log("\n1. register");
let res = await send(register, { method: "POST", body: { username: "ayush", email: "ayush@example.com", password: "supersecret1" } });
check("valid register -> 200", res.status === 200 && (await data(res)).ok);

res = await send(register, { method: "POST", body: { username: "ayush", email: "other@example.com", password: "supersecret1" } });
check("duplicate username -> 409", res.status === 409);

res = await send(register, { method: "POST", body: { username: "bob", email: "bob@example.com", password: "short" } });
check("short password -> 400", res.status === 400);

res = await send(register, { method: "POST", body: { username: "bob", email: "not-an-email", password: "supersecret1" } });
check("bad email -> 400", res.status === 400);

console.log("\n2. login");
res = await send(login, { method: "POST", body: { identifier: "ayush", password: "wrongpass" } });
check("wrong password -> 401", res.status === 401);

res = await send(login, { method: "POST", body: { identifier: "ayush", password: "supersecret1" } });
check("correct login -> 200", res.status === 200 && (await data(res)).username === "ayush");
const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
check("session cookie set", cookie.startsWith("tdc_session=") && cookie.length > 20, cookie);

res = await send(login, { method: "POST", body: { identifier: "AYUSH@EXAMPLE.COM", password: "supersecret1" } });
check("login by email (case-insensitive) -> 200", res.status === 200);

console.log("\n3. protected page (me)");
res = await send(me, {});
check("no cookie -> 401", res.status === 401);

res = await send(me, { cookie });
check("with cookie -> 200", res.status === 200);
const meData = await data(res);
check("returns username + joined", meData.username === "ayush" && /^\d{4}-\d{2}-\d{2}$/.test(meData.joined));

console.log("\n4. profile update");
res = await send(profile, { method: "POST", body: { bio: "Full-stack dev in progress." }, cookie });
check("save bio -> 200", res.status === 200);

res = await send(me, { cookie });
check("bio persisted", (await data(res)).bio === "Full-stack dev in progress.");

res = await send(profile, { method: "POST", body: { bio: "nope" } });
check("profile without login -> 401", res.status === 401);

console.log("\n5. logout");
res = await send(logout, { method: "POST", cookie });
check("logout -> 200", res.status === 200);
check("cookie cleared", (res.headers.get("set-cookie") || "").includes("Max-Age=0"));

res = await send(me, { cookie });
check("old cookie no longer works -> 401", res.status === 401);

console.log("\n6. password storage");
const rows = await pg.query("SELECT password_hash FROM users WHERE username = 'ayush'");
check("password is hashed (not plain text)", rows.rows[0].password_hash.startsWith("scrypt$"));
check("plain password never stored", !rows.rows[0].password_hash.includes("supersecret1"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
