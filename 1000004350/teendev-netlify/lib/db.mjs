/**
 * Shared backend helpers: database, password hashing, sessions, cookies.
 * Used by every function in netlify/functions/.
 */
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

/* ------------------------------------------------------------------ database */
let _sql = null;

export function getSql() {
  if (_sql) return _sql;
  const url =
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "No database connection string found. Add a Postgres database (Neon) and " +
      "set DATABASE_URL / NETLIFY_DATABASE_URL in your environment."
    );
  }
  _sql = neon(url);
  return _sql;
}

/** Used only by the local test harness. */
export function __setSqlForTesting(fn) {
  _sql = fn;
}

let schemaReady = false;
export async function ensureSchema() {
  if (schemaReady) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      bio           TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  schemaReady = true;
}

/* ------------------------------------------------------------- passwords --- */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(test, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* --------------------------------------------------------------- sessions -- */
export const SESSION_COOKIE = "tdc_session";
export const newToken = () => crypto.randomBytes(32).toString("hex");

export function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const pair of header.split(";")) {
    const i = pair.indexOf("=");
    if (i > -1 && pair.slice(0, i).trim() === name) {
      return decodeURIComponent(pair.slice(i + 1).trim());
    }
  }
  return null;
}

export function sessionCookie(name, value, request, maxAge) {
  let isHttps = true;
  try { isHttps = new URL(request.url).protocol === "https:"; } catch (e) { /* keep default */ }
  let c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (isHttps) c += "; Secure";
  if (maxAge != null) c += `; Max-Age=${maxAge}`;
  return c;
}

export async function currentUser(request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.username, u.email, u.bio, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token}
  `;
  return rows[0] || null;
}

/* ---------------------------------------------------------------- response - */
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
