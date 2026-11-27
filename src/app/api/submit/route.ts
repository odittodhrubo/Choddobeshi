import { NextResponse } from "next/server";
import { submitContent } from "@/server/submissions";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await submitContent(token, raw);
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.error }, { status: result.status });
}
