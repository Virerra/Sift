import { NextResponse } from "next/server";
import { validateReportSubmission } from "@sift/schema";
import { insertReport, getAggregateStats } from "@/lib/db";

// Open CORS on purpose. This endpoint has no auth and no cookies to
// protect, so origin-restricting it wouldn't add real security — it would
// just break the one legitimate cross-origin caller that matters:
// AdSentinel's popup, which calls this from a chrome-extension:// origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Unauthenticated by design — "no accounts required" is a project
// principle, not an oversight. That does mean this endpoint has no
// per-submitter identity to rate-limit against. Schema validation (known
// flag types/categories only, max 50 flagged ads per submission) is the
// current abuse boundary. Worth adding Upstash Redis or a Vercel Firewall
// rule for real rate-limiting before wide public launch — not solved here
// speculatively without a concrete abuse pattern to design against.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const result = validateReportSubmission(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Submission failed validation", details: result.error },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  await insertReport(result.data);
  return NextResponse.json({ ok: true }, { status: 201, headers: CORS_HEADERS });
}

export async function GET() {
  const stats = await getAggregateStats();
  return NextResponse.json(stats, { headers: CORS_HEADERS });
}
