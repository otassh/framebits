import { randomUUID } from "node:crypto";
import pg from "pg";

export const DB_PACKAGE_NAME = "@framebits/db";

export type AuthUser = { id: string; login: string; name: string | null };
export type GitHubIdentity = { githubId: string; login: string; name: string | null };
export type OAuthTransaction = {
  stateHash: string;
  browserHash: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: Date;
};

export interface AuthStore {
  health(): Promise<void>;
  saveOAuth(transaction: OAuthTransaction): Promise<void>;
  consumeOAuth(stateHash: string, browserHash: string, now: Date): Promise<OAuthTransaction | null>;
  createSession(
    identity: GitHubIdentity,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
    previousTokenHash?: string,
  ): Promise<AuthUser>;
  findSession(tokenHash: string, now: Date): Promise<AuthUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
  allowRequest(
    keyHash: string,
    windowStart: Date,
    expiresAt: Date,
    limit: number,
  ): Promise<boolean>;
  cleanup(now: Date): Promise<void>;
}

export interface SqlClient {
  // Callers select the row shape, matching pg.Pool's generic query contract.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    parameters?: unknown[],
  ): Promise<{ rows: Row[] }>;
}
export interface SqlConnection extends SqlClient {
  release(): void;
}
export interface SqlPool extends SqlClient {
  connect(): Promise<SqlConnection>;
  end(): Promise<void>;
}
type OAuthRow = {
  state_hash: string;
  browser_hash: string;
  code_verifier: string;
  return_to: string;
  expires_at: Date;
};

// Identity uses GitHub's immutable ID. Only hashes of random bearer tokens reach SQL.
const AUTH_SCHEMA = `
  CREATE TABLE auth_users (
    id uuid PRIMARY KEY,
    github_id bigint NOT NULL UNIQUE CHECK (github_id > 0),
    login varchar(39) NOT NULL,
    name varchar(100),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  );
  CREATE TABLE auth_sessions (
    token_hash char(64) PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
  );
  CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
  CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
  CREATE TABLE auth_oauth_transactions (
    state_hash char(64) PRIMARY KEY,
    browser_hash char(64) NOT NULL,
    code_verifier varchar(128) NOT NULL,
    return_to varchar(2048) NOT NULL,
    expires_at timestamptz NOT NULL
  );
  CREATE INDEX auth_oauth_expiry ON auth_oauth_transactions(expires_at);
  CREATE TABLE auth_rate_limits (
    key_hash char(64) NOT NULL,
    window_start timestamptz NOT NULL,
    requests integer NOT NULL CHECK (requests > 0),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (key_hash, window_start)
  );
  CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits(expires_at);
`;

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: SqlPool) {}

  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(736281946)");
      await client.query(`CREATE TABLE IF NOT EXISTS framebits_migrations (
        version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      const applied = await client.query(
        "SELECT version FROM framebits_migrations WHERE version = $1",
        [1],
      );
      if (applied.rows.length === 0) {
        await client.query(AUTH_SCHEMA);
        await client.query("INSERT INTO framebits_migrations(version) VALUES ($1)", [1]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async health(): Promise<void> {
    const result = await this.pool.query(
      "SELECT 1 FROM framebits_migrations WHERE version = $1",
      [1],
    );
    if (result.rows.length === 0) throw new Error("Database migrations have not been applied");
  }

  async saveOAuth(transaction: OAuthTransaction): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_oauth_transactions (state_hash, browser_hash, code_verifier, return_to, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        transaction.stateHash,
        transaction.browserHash,
        transaction.codeVerifier,
        transaction.returnTo,
        transaction.expiresAt,
      ],
    );
  }

  async consumeOAuth(
    stateHash: string,
    browserHash: string,
    now: Date,
  ): Promise<OAuthTransaction | null> {
    // Atomic consumption prevents callback replay across concurrent processes.
    const result = await this.pool.query<OAuthRow>(
      `DELETE FROM auth_oauth_transactions
       WHERE state_hash = $1 AND browser_hash = $2 AND expires_at > $3 RETURNING *`,
      [stateHash, browserHash, now],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          stateHash: row.state_hash,
          browserHash: row.browser_hash,
          codeVerifier: row.code_verifier,
          returnTo: row.return_to,
          expiresAt: row.expires_at,
        };
  }

  async createSession(
    identity: GitHubIdentity,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
    previousTokenHash?: string,
  ): Promise<AuthUser> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<AuthUser>(
        `INSERT INTO auth_users(id, github_id, login, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (github_id) DO UPDATE
         SET login = EXCLUDED.login, name = EXCLUDED.name, updated_at = EXCLUDED.updated_at
         RETURNING id, login, name`,
        [randomUUID(), identity.githubId, identity.login, identity.name, now],
      );
      const user = result.rows[0];
      if (user === undefined) throw new Error("Identity could not be saved");
      if (previousTokenHash !== undefined) {
        await client.query("DELETE FROM auth_sessions WHERE token_hash = $1", [previousTokenHash]);
      }
      await client.query(
        "INSERT INTO auth_sessions(token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
        [tokenHash, user.id, now, expiresAt],
      );
      await client.query("COMMIT");
      return user;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findSession(tokenHash: string, now: Date): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUser>(
      `SELECT u.id, u.login, u.name FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [tokenHash, now],
    );
    return result.rows[0] ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [tokenHash]);
  }

  async allowRequest(
    keyHash: string,
    windowStart: Date,
    expiresAt: Date,
    limit: number,
  ): Promise<boolean> {
    const result = await this.pool.query<{ requests: number }>(
      `INSERT INTO auth_rate_limits(key_hash, window_start, requests, expires_at) VALUES ($1, $2, 1, $3)
       ON CONFLICT (key_hash, window_start) DO UPDATE
       SET requests = LEAST(auth_rate_limits.requests + 1, $4) RETURNING requests`,
      [keyHash, windowStart, expiresAt, limit + 1],
    );
    const row = result.rows[0];
    return row !== undefined && row.requests <= limit;
  }

  async cleanup(now: Date): Promise<void> {
    await this.pool.query("DELETE FROM auth_oauth_transactions WHERE expires_at <= $1", [now]);
    await this.pool.query("DELETE FROM auth_sessions WHERE expires_at <= $1", [now]);
    await this.pool.query("DELETE FROM auth_rate_limits WHERE expires_at <= $1", [now]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createPostgresStore(connectionString: string): PostgresAuthStore {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
    query_timeout: 6000,
    application_name: "framebits-api",
  });
  // Connection errors can contain credentials; keep logs deliberately generic.
  pool.on("error", () => {
    process.stderr.write("Database connection lost\n");
  });
  return new PostgresAuthStore(pool);
}
