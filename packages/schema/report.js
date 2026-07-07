/**
 * @sift/schema — the versioned contract between anything that PRODUCES a
 * report (AdSentinel, later AuditTool) and anything that CONSUMES one
 * (AdDashboard).
 *
 * Deliberately narrow. This is NOT the same shape as AdSentinel's local
 * Export JSON/CSV — that export is for the user's own file, on their own
 * machine, and can contain whatever's useful to them (full ad text, page
 * URL, DOM locator). This schema is for the subset that's safe to send to
 * an unauthenticated public endpoint and aggregate into public statistics.
 *
 * What's deliberately excluded, and why:
 *  - page URL       — could reveal exactly what the submitter was viewing;
 *                      only the platform (hostname) is kept.
 *  - raw ad text     — AdDashboard v1 is aggregate-only (counts by
 *                      platform/category), specifically so this endpoint
 *                      never becomes a place where arbitrary free text
 *                      submitted by anonymous users gets stored and
 *                      redisplayed publicly. Revisit only alongside real
 *                      moderation, not before.
 *  - DOM locator     — meaningless outside the submitter's own browser.
 *
 * Trust model, stated plainly: because raw ad content never leaves the
 * submitter's browser, AdDashboard has no way to re-run the heuristics
 * server-side and confirm a submission is "real" — it can only check that
 * a submission is *structurally* well-formed (known flag types, category
 * required exactly where it should be, sane array sizes). A bad actor
 * could submit fabricated counts. That's the same class of limitation
 * most anonymous client-side analytics have, and it's a reasonable
 * trade for v1 — revisit if it actually becomes a problem in practice,
 * rather than solving it speculatively by collecting more than needed.
 *
 * Versioned because this contract WILL change — bumping SCHEMA_VERSION is
 * cheap; silently changing shape and breaking every consumer is not.
 */

import { z } from "zod";

export const SCHEMA_VERSION = 1;

const KNOWN_PLATFORMS = ["youtube.com", "facebook.com", "instagram.com", "tiktok.com", "other"];

// Mirrors packages/heuristics FLAG_TYPES — duplicated deliberately rather
// than imported, so this package has zero dependency on heuristics and can
// validate a submission even if the submitter is running a slightly older
// or newer ruleset version.
const FLAG_TYPES = [
  "dark_pattern",
  "age_mismatch_category",
  "unverified_ad_network",
  "missing_accessible_text",
  "needs_human_review"
];

const AGE_CATEGORIES = ["gambling", "dating", "alcohol_vaping", "crypto_getrichquick", "weight_loss", "cosmetic_procedures"];

export const FlagSummarySchema = z
  .object({
    type: z.enum(FLAG_TYPES),
    category: z.enum(AGE_CATEGORIES).optional() // only present on age_mismatch_category flags
  })
  .refine(
    (flag) => (flag.type === "age_mismatch_category") === (flag.category !== undefined),
    { message: "category must be present if and only if type is age_mismatch_category" }
  );

export const ReportSubmissionSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  platform: z.enum(KNOWN_PLATFORMS),
  childDirectedPage: z.boolean(),
  submittedAt: z.string().datetime(),
  // One entry per flagged ad on the page that was scanned — deliberately
  // just the flags, not the ad content itself. See file header.
  flaggedAds: z
    .array(
      z.object({
        flags: z.array(FlagSummarySchema).min(1)
      })
    )
    .max(50) // a single page reporting 50+ flagged ads is almost certainly not a real scan
});

/**
 * Reduces a page's hostname down to one of the known platforms, or "other".
 * Used both when AdSentinel builds a submission and when AdDashboard
 * double-checks one server-side — keeping this in one place means the two
 * can't quietly drift into disagreeing about what counts as "youtube.com".
 */
export function platformFromHostname(hostname) {
  const host = (hostname || "").toLowerCase();
  const match = KNOWN_PLATFORMS.find((p) => p !== "other" && host.endsWith(p));
  return match || "other";
}

/**
 * Validates a submission and returns { success, data } or { success, error }
 * — a thin wrapper so consumers don't need their own zod import just to
 * check a boolean.
 */
export function validateReportSubmission(payload) {
  const result = ReportSubmissionSchema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.flatten() };
}
