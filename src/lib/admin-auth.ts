// Authentification minimale pour l'espace de gestion interne "Parle-nous".
// Un mot de passe partagé (hashé, comparé en temps constant) protège
// /admin ; une session est ensuite matérialisée par un cookie signé
// (HMAC), sans dépendance externe ni compte utilisateur individuel.
// Suffisant pour une petite équipe habilitée ; migrer vers des comptes
// nominatifs (ex. Supabase Auth) reste possible plus tard si besoin.
import { createHmac, timingSafeEqual, scryptSync } from "node:crypto";

const COOKIE_NAME = "jc_admin_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function getSessionSecret(): string | null {
  return import.meta.env.ADMIN_SESSION_SECRET || null;
}

function getPasswordHash(): string | null {
  return import.meta.env.ADMIN_PASSWORD_HASH || null;
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(getSessionSecret() && getPasswordHash());
}

/** Compare le mot de passe saisi au hash stocké (scrypt, temps constant). */
export function verifyAdminPassword(candidate: string): boolean {
  const stored = getPasswordHash();
  if (!stored || !candidate) return false;

  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = scryptSync(candidate, salt, expected.length);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function sign(payload: string): string {
  const secret = getSessionSecret();
  if (!secret) throw new Error("ADMIN_SESSION_SECRET manquant");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Construit la valeur de cookie de session (payload + signature). */
export function createSessionToken(): string {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = String(expiresAt);
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/** Vérifie signature + expiration d'un token de session. */
export function isValidSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_COOKIE_MAX_AGE_SECONDS = SESSION_DURATION_MS / 1000;
