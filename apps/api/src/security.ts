import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const randomToken = (): string => randomBytes(32).toString("base64url");
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
export const pkceChallenge = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");
export const csrfToken = (sessionToken: string): string =>
  createHmac("sha256", sessionToken).update("framebits-csrf-v1").digest("base64url");

export function equalToken(actual: string | undefined, expected: string): boolean {
  if (actual === undefined || !TOKEN_PATTERN.test(actual) || !TOKEN_PATTERN.test(expected))
    return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function safeReturnTo(value: string | undefined, origin: string): string {
  if (
    value === undefined ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/";
  }
  for (const character of decoded) {
    if (character === "\\" || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
      return "/";
  }
  if (decoded.startsWith("//")) return "/";
  const url = new URL(value, origin);
  if (url.origin !== origin || url.pathname.startsWith("/api/") || url.pathname === "/api")
    return "/";
  url.searchParams.delete("auth_error");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function clientAddress(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
  trustedProxyCount: number,
): string {
  const remote =
    remoteAddress !== undefined && isIP(remoteAddress) !== 0 ? remoteAddress : "unknown";
  if (trustedProxyCount === 0 || forwardedFor === undefined || forwardedFor.length > 2048)
    return remote;
  const forwarded = forwardedFor.split(",").map((value) => value.trim());
  if (forwarded.some((value) => isIP(value) === 0)) return remote;
  const chain = [...forwarded, remote];
  return chain.length > trustedProxyCount
    ? (chain[chain.length - 1 - trustedProxyCount] ?? remote)
    : remote;
}

export function rateLimitKey(secret: string, bucket: string, address: string): string {
  return createHmac("sha256", secret).update(`${bucket}:${address}`).digest("hex");
}
