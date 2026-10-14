// Client pour le prestataire de paiement nyole (https://nyole.com) —
// encaissement Mobile Money (Orange Money, Wave, MTN MoMo, Moov Money…) et
// carte bancaire pour "Soutenez-nous". Référence : https://nyole.com/docs/
//
// Principe : on crée une session de paiement côté serveur, on redirige le
// donateur vers la page de paiement hébergée par nyole (qui gère le choix
// de l'opérateur, les OTP, la carte bancaire…), puis on attend la
// confirmation par webhook signé (événement "payment.completed") avant de
// considérer un don comme réellement reçu — jamais sur la seule foi de la
// redirection vers success_url.
import { createHmac, timingSafeEqual } from "node:crypto";

const NYOLE_API_BASE = "https://app.nyole.com/api/v1";
const WEBHOOK_MAX_CLOCK_SKEW_SECONDS = 300; // 5 minutes, comme recommandé par nyole

export interface NyoleCheckoutSessionParams {
  amount: number;
  currency?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface NyoleCheckoutSession {
  id: string;
  object: string;
  url: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  livemode: boolean;
  created: string;
}

export type NyoleSessionStatusValue = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "REFUNDED";

export interface NyoleSessionStatusResponse {
  id: string;
  status: NyoleSessionStatusValue;
  paid: boolean;
  amount: number;
  currency: string;
  order_id: string;
  provider?: string;
  provider_reference?: string;
}

function getSecretKey(): string | null {
  const key = import.meta.env.NYOLE_SECRET_KEY;
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : null;
}

/**
 * `true` seulement lorsqu'une clé secrète nyole est renseignée
 * (NYOLE_SECRET_KEY). Tant que ce n'est pas le cas, /api/dons ne doit
 * jamais prétendre qu'un paiement a été initié ou réussi.
 */
export function isNyoleConfigured(): boolean {
  return getSecretKey() !== null;
}

type NyoleResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createNyoleCheckoutSession(
  params: NyoleCheckoutSessionParams
): Promise<NyoleResult<NyoleCheckoutSession>> {
  const secretKey = getSecretKey();
  if (!secretKey) return { ok: false, error: "nyole_not_configured" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };
  if (params.idempotencyKey) headers["Idempotency-Key"] = params.idempotencyKey;

  try {
    const response = await fetch(`${NYOLE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        customer_name: params.customerName,
        customer_email: params.customerEmail,
        customer_phone: params.customerPhone,
        description: params.description,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error(`[nyole] Échec de création de session de paiement (HTTP ${response.status}) :`, bodyText);
      return { ok: false, error: "nyole_api_error" };
    }

    const data = (await response.json()) as NyoleCheckoutSession;
    return { ok: true, data };
  } catch (error) {
    console.error("[nyole] Erreur réseau lors de la création de la session de paiement :", error);
    return { ok: false, error: "nyole_network_error" };
  }
}

export async function getNyoleSessionStatus(sessionId: string): Promise<NyoleResult<NyoleSessionStatusResponse>> {
  const secretKey = getSecretKey();
  if (!secretKey) return { ok: false, error: "nyole_not_configured" };

  try {
    const response = await fetch(
      `${NYOLE_API_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}/status`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    if (!response.ok) return { ok: false, error: "nyole_api_error" };
    const data = (await response.json()) as NyoleSessionStatusResponse;
    return { ok: true, data };
  } catch (error) {
    console.error("[nyole] Erreur réseau lors de la vérification du statut :", error);
    return { ok: false, error: "nyole_network_error" };
  }
}

/**
 * Vérifie la signature HMAC-SHA256 d'un webhook nyole — voir
 * https://nyole.com/docs/webhooks/signature/. `rawBody` DOIT être la chaîne
 * brute exactement telle que reçue (jamais un JSON reparsé puis
 * re-sérialisé), sans quoi la signature ne correspondra jamais.
 */
export function verifyNyoleWebhookSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null
): boolean {
  const secretKey = getSecretKey();
  if (!secretKey || !timestampHeader || !signatureHeader) return false;

  const v1 = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("v1="))
    ?.slice(3);
  if (!v1) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_MAX_CLOCK_SKEW_SECONDS) return false;

  const expected = createHmac("sha256", secretKey).update(`${timestampHeader}.${rawBody}`).digest("hex");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(v1);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export interface NyoleWebhookPayload {
  event: "payment.completed" | "payment.failed" | "payment.cancelled" | "payment.updated" | string;
  livemode: boolean;
  data: {
    id: string;
    order_id: string;
    status: NyoleSessionStatusValue;
    amount: number;
    currency: string;
    provider?: string;
    provider_reference?: string;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    metadata?: Record<string, string>;
    completed_at?: string | null;
  };
  timestamp: string;
}
