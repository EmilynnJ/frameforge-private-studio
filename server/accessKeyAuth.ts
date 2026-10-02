import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { getSessionCookieOptions } from "./_core/cookies";

export const ACCESS_SESSION_COOKIE = "studiocut_access";
const ACCESS_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function configuredAccessKey() {
  return process.env.STUDIO_ACCESS_KEY ?? "";
}

function signingSecret() {
  return process.env.JWT_SECRET ?? "";
}

function digest(value: string) {
  return createHmac("sha256", signingSecret()).update(value).digest("hex");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyAccessKey(candidate: string) {
  const configured = configuredAccessKey();
  if (!configured || !candidate) return false;
  return constantTimeEqual(digest(candidate), digest(configured));
}

export function createAccessSessionToken() {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${issuedAt}.${issuedAt + ACCESS_SESSION_TTL_SECONDS}`;
  return `${payload}.${createHmac("sha256", signingSecret()).update(payload).digest("hex")}`;
}

export function verifyAccessSessionToken(token: string | undefined) {
  if (!token || !signingSecret()) return false;
  const [issuedAtText, expiresAtText, signature] = token.split(".");
  const issuedAt = Number(issuedAtText);
  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !signature || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const payload = `${issuedAt}.${expiresAt}`;
  const expected = createHmac("sha256", signingSecret()).update(payload).digest("hex");
  return constantTimeEqual(signature, expected);
}

function readCookie(request: Request, name: string) {
  const raw = request.headers.cookie ?? "";
  const match = raw.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export function hasAccessSession(request: Request) {
  return verifyAccessSessionToken(readCookie(request, ACCESS_SESSION_COOKIE));
}

export function getAccessCookieOptions(request: Request) {
  return { ...getSessionCookieOptions(request), maxAge: ACCESS_SESSION_TTL_SECONDS * 1000 };
}

export function getExpiredAccessCookieOptions(request: Request) {
  return { ...getSessionCookieOptions(request), maxAge: -1 };
}
