import { describe, expect, it, vi } from "vitest";
import { PostgresAuthStore, type SqlClient } from "./index.js";

function setup() {
  const query = vi.fn<SqlClient["query"]>().mockResolvedValue({ rows: [] });
  const release = vi.fn();
  const client = { query: query as SqlClient["query"], release };
  const poolQuery = vi.fn<SqlClient["query"]>().mockResolvedValue({ rows: [] });
  const pool = {
    query: poolQuery as SqlClient["query"],
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  return { query, release, poolQuery, store: new PostgresAuthStore(pool) };
}

const now = new Date("2026-01-01T00:00:00Z");
const expiresAt = new Date("2026-01-02T00:00:00Z");

describe("PostgreSQL auth store", () => {
  it("applies schema under a transaction lock and records the version", async () => {
    const { store, query, release } = setup();
    await store.migrate();
    expect(query.mock.calls[0]?.[0]).toBe("BEGIN");
    expect(query.mock.calls[1]?.[0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls.some(([sql]) => sql.includes("CREATE TABLE auth_sessions"))).toBe(true);
    expect(query).toHaveBeenCalledWith(
      "INSERT INTO framebits_migrations(version) VALUES ($1)",
      [1],
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not reapply an existing migration", async () => {
    const { store, query } = setup();
    query.mockResolvedValue({ rows: [{ version: 1 }] });
    await store.migrate();
    expect(query.mock.calls.some(([sql]) => sql.includes("CREATE TABLE auth_sessions"))).toBe(
      false,
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("rolls back and releases the connection when migration fails", async () => {
    const { store, query, release } = setup();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("database unavailable"));
    await expect(store.migrate()).rejects.toThrow("database unavailable");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("fails health checks when the expected schema version is absent", async () => {
    const { store, poolQuery } = setup();
    await expect(store.health()).rejects.toThrow("migrations have not been applied");
    poolQuery.mockResolvedValue({ rows: [{ version: 1 }] });
    await expect(store.health()).resolves.toBeUndefined();
  });

  it("atomically consumes unexpired OAuth state only for the matching browser", async () => {
    const { store, poolQuery } = setup();
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          state_hash: "state",
          browser_hash: "browser",
          code_verifier: "verifier",
          return_to: "/components",
          expires_at: expiresAt,
        },
      ],
    });
    await expect(store.consumeOAuth("state", "browser", now)).resolves.toMatchObject({
      stateHash: "state",
      browserHash: "browser",
      returnTo: "/components",
      expiresAt,
    });
    expect(poolQuery.mock.calls[0]?.[0]).toContain("DELETE FROM auth_oauth_transactions");
    expect(poolQuery.mock.calls[0]?.[0]).toContain("expires_at > $3 RETURNING");
    expect(poolQuery.mock.calls[0]?.[1]).toEqual(["state", "browser", now]);
    await expect(store.consumeOAuth("state", "browser", now)).resolves.toBeNull();
  });

  it("rotates the previous session in the same transaction as the identity upsert", async () => {
    const { store, query, release } = setup();
    const user = { id: "user-id", login: "otassh", name: null };
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [user] });
    await expect(
      store.createSession(
        { githubId: "123", login: "otassh", name: null },
        "new-hash",
        expiresAt,
        now,
        "old-hash",
      ),
    ).resolves.toEqual(user);
    expect(query.mock.calls[1]?.[0]).toContain("ON CONFLICT (github_id)");
    expect(query.mock.calls[2]).toEqual([
      "DELETE FROM auth_sessions WHERE token_hash = $1",
      ["old-hash"],
    ]);
    expect(query.mock.calls[3]?.[1]).toEqual(["new-hash", "user-id", now, expiresAt]);
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back session rotation when the new session cannot be stored", async () => {
    const { store, query, release } = setup();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "user-id", login: "otassh", name: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("session insert failed"));
    await expect(
      store.createSession(
        { githubId: "123", login: "otassh", name: null },
        "new-hash",
        expiresAt,
        now,
        "old-hash",
      ),
    ).rejects.toThrow("session insert failed");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects rate limit counts above the configured threshold", async () => {
    const { store, poolQuery } = setup();
    poolQuery
      .mockResolvedValueOnce({ rows: [{ requests: 2 }] })
      .mockResolvedValueOnce({ rows: [{ requests: 3 }] });
    await expect(store.allowRequest("key", now, expiresAt, 2)).resolves.toBe(true);
    await expect(store.allowRequest("key", now, expiresAt, 2)).resolves.toBe(false);
    expect(poolQuery.mock.calls[0]?.[1]).toEqual(["key", now, expiresAt, 3]);
  });
});
