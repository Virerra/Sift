import { timingSafeEqual } from "node:crypto";

/**
 * Checks a request's Authorization header against ADMIN_TOKEN.
 *
 * Deliberately a single shared secret, not an account system — "no
 * accounts required" is a project principle for the public-facing parts
 * of SIFT, and moderation is the one place that principle genuinely
 * can't extend to (an unauthenticated public DELETE would let anyone
 * wipe the dataset). One secret, known only to whoever runs this
 * deployment, is the minimal gate that's actually needed here.
 *
 * Known limitation, stated plainly: no rate limiting on failed attempts.
 * Same class of gap as the public POST endpoint's lack of rate limiting
 * — acceptable for now given a sufficiently long random token, worth
 * revisiting if this deployment ever becomes a higher-value target.
 */
export function isAuthorized(request) {
  const configuredToken = process.env.ADMIN_TOKEN;
  if (!configuredToken) return false; // admin routes are hard-disabled until this is set

  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(configuredToken);
  if (a.length !== b.length) return false; // timingSafeEqual requires equal-length buffers
  return timingSafeEqual(a, b);
}
