import { randomBytes } from "node:crypto";

export type ApiConfig = {
  databaseUrl: string;
  webOrigin: string;
  port: number;
  trustedProxyCount: number;
  secureCookies: boolean;
  rateLimitSecret: string;
  github: { clientId: string; clientSecret: string; callbackUrl: string } | null;
};

function integer(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  const text = value ?? String(fallback);
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be an integer`);
  const number = Number(text);
  if (number < min || number > max) throw new Error(`${name} is out of range`);
  return number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const production = env.NODE_ENV === "production";
  const originText = env.WEB_ORIGIN ?? (production ? "" : "http://localhost:5173");
  let origin: URL;
  try {
    origin = new URL(originText);
  } catch {
    throw new Error("WEB_ORIGIN must be a valid origin");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    originText !== origin.origin ||
    origin.username !== "" ||
    origin.password !== "" ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback && !production))
  )
    throw new Error("WEB_ORIGIN must be HTTPS (local HTTP is allowed in development)");

  const databaseUrl = env.DATABASE_URL ?? "";
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is required and must be a PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || database.hostname === "") {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  if (
    production &&
    ["", "changeme", "framebits-local-dev-only"].includes(decodeURIComponent(database.password))
  ) {
    throw new Error("Production database credentials must be configured");
  }

  const clientId = env.GITHUB_CLIENT_ID ?? "";
  const clientSecret = env.GITHUB_CLIENT_SECRET ?? "";
  if ((clientId === "") !== (clientSecret === ""))
    throw new Error("Both GitHub OAuth credentials must be configured");
  if (
    clientId !== "" &&
    (!/^[a-zA-Z0-9_.-]{10,100}$/.test(clientId) || !/^[a-zA-Z0-9_.-]{20,200}$/.test(clientSecret))
  ) {
    throw new Error("GitHub OAuth credentials are invalid");
  }
  if (production && clientId === "")
    throw new Error("Production GitHub OAuth credentials are required");
  const rateLimitSecret =
    env.RATE_LIMIT_SECRET ?? (production ? "" : randomBytes(32).toString("base64url"));
  if (rateLimitSecret.length < 32 || /^(change|example|placeholder)/i.test(rateLimitSecret)) {
    throw new Error("RATE_LIMIT_SECRET must be at least 32 characters");
  }
  return {
    databaseUrl,
    webOrigin: origin.origin,
    port: integer(env.PORT, 3001, 1, 65535, "PORT"),
    trustedProxyCount: integer(env.TRUSTED_PROXY_COUNT, 0, 0, 5, "TRUSTED_PROXY_COUNT"),
    secureCookies: origin.protocol === "https:",
    rateLimitSecret,
    github:
      clientId === ""
        ? null
        : { clientId, clientSecret, callbackUrl: `${origin.origin}/api/auth/github/callback` },
  };
}
