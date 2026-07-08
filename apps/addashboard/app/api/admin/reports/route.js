import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/adminAuth";
import { listReports, deleteReports } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reports = await listReports();
  return NextResponse.json({ reports });
}

export async function DELETE(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { reportId, platform, all } = body;
  const specifiedCount = [reportId, platform, all].filter((v) => v !== undefined && v !== null && v !== false).length;

  if (specifiedCount !== 1) {
    return NextResponse.json(
      { error: "Specify exactly one of: reportId, platform, or all:true" },
      { status: 400 }
    );
  }

  const deletedRows = await deleteReports({ reportId, platform, all });
  return NextResponse.json({ ok: true, deletedRows });
}
