/* eslint-disable */
/**
 * AUTO-GENERATED from shared/schema — DO NOT EDIT BY HAND.
 * Regenerate with: pnpm --filter @veilleur/shared run gen
 */

/**
 * A Web Push subscription the operator's PWA persists so the Minion can send a notification on run completion (F-012, FR-E2). Written client-side by the PWA (the first client-writable Firestore collection) at `pushSubscriptions/{sha256(endpoint)}`; read server-side by the Minion. Source of truth for both the PWA writer and the Minion sender.
 */
export interface PushSubscription {
  /**
   * Push service endpoint URL from the browser PushSubscription. The sha256 of this value is the Firestore document id, so re-subscribing upserts rather than duplicating.
   */
  endpoint: string;
  /**
   * Client public encryption keys from the PushSubscription, used by the sender (pywebpush) to encrypt the payload.
   */
  keys: {
    /**
     * Base64url-encoded P-256 ECDH public key.
     */
    p256dh: string;
    /**
     * Base64url-encoded auth secret.
     */
    auth: string;
  };
  /**
   * The allowed operator's email. Lets the Firestore ownership rule assert the writer owns this subscription (constitution §2.1 mono-tenant boundary).
   */
  operatorEmail: string;
  /**
   * ISO-8601 timestamp when the subscription was created/refreshed.
   */
  createdAt: string;
}
