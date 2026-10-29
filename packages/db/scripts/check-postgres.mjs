import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import process from "node:process";
import pg from "pg";
import { PostgresAuthStore } from "../dist/index.js";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required (use a test database)");

// Every run owns a separate schema; existing application tables are never touched.
const schema = `framebits_test_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Pool({ connectionString });
const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}` });
const store = new PostgresAuthStore(pool);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const now = new Date();
const future = new Date(now.getTime() + 60_000);
const past = new Date(now.getTime() - 60_000);
let checks = 0;

try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await assert.rejects(() => store.health());
  await Promise.all([store.migrate(), store.migrate(), store.migrate()]);
  await store.health();
  assert.equal((await pool.query("SELECT * FROM framebits_migrations")).rows.length, 1);
  checks++;

  const transaction = {
    stateHash: hash("state"),
    browserHash: hash("browser"),
    codeVerifier: "verifier",
    returnTo: "/components",
    expiresAt: future,
  };
  await store.saveOAuth(transaction);
  assert.equal(await store.consumeOAuth(transaction.stateHash, hash("wrong-browser"), now), null);
  const callbacks = await Promise.all(
    Array.from({ length: 5 }, () =>
      store.consumeOAuth(transaction.stateHash, transaction.browserHash, now),
    ),
  );
  assert.equal(callbacks.filter(Boolean).length, 1, "OAuth state can only be consumed once");
  assert.equal(callbacks.find(Boolean).returnTo, "/components");
  await store.saveOAuth({ ...transaction, stateHash: hash("expired-state"), expiresAt: past });
  assert.equal(await store.consumeOAuth(hash("expired-state"), transaction.browserHash, now), null);
  checks++;

  const identity = { githubId: "123456", login: "before", name: null };
  const first = await store.createSession(identity, hash("session-one"), future, now);
  assert.equal((await store.findSession(hash("session-one"), now)).id, first.id);
  const updated = await store.createSession(
    { ...identity, login: "after" },
    hash("session-two"),
    future,
    now,
    hash("session-one"),
  );
  assert.equal(updated.id, first.id, "GitHub ID preserves the user across login changes");
  assert.equal(updated.login, "after");
  assert.equal(await store.findSession(hash("session-one"), now), null);
  assert.equal((await store.findSession(hash("session-two"), now)).login, "after");
  assert.equal((await pool.query("SELECT * FROM auth_users")).rows.length, 1);
  checks++;

  await assert.rejects(() =>
    store.createSession(
      { ...identity, login: "rolled-back" },
      "x".repeat(65),
      future,
      now,
      hash("session-two"),
    ),
  );
  assert.equal(
    (await store.findSession(hash("session-two"), now)).login,
    "after",
    "failed rotation restores both the old session and the identity",
  );
  checks++;

  const allowed = await Promise.all(
    Array.from({ length: 10 }, () => store.allowRequest(hash("login-ip"), now, future, 3)),
  );
  assert.equal(allowed.filter(Boolean).length, 3, "parallel requests cannot exceed the limit");
  assert.equal(await store.allowRequest(hash("another-ip"), now, future, 3), true);
  checks++;

  await store.createSession(identity, hash("expired-session"), past, now);
  assert.equal(await store.findSession(hash("expired-session"), now), null);
  await store.allowRequest(hash("expired-limit"), past, past, 3);
  await store.cleanup(now);
  assert.equal((await pool.query("SELECT * FROM auth_oauth_transactions")).rows.length, 0);
  assert.equal(
    (await pool.query("SELECT * FROM auth_sessions WHERE expires_at <= $1", [now])).rows.length,
    0,
  );
  assert.equal(
    (await pool.query("SELECT * FROM auth_rate_limits WHERE expires_at <= $1", [now])).rows.length,
    0,
  );
  await store.deleteSession(hash("session-two"));
  assert.equal(await store.findSession(hash("session-two"), now), null);
  checks++;
  process.stdout.write(`PostgreSQL integration: ${checks} checks passed.\n`);
} finally {
  await store.close();
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    await admin.end();
  }
}
