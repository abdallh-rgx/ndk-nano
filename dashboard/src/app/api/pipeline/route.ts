import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import seed from "@/data/pipeline-state.json";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const file = path.join(process.cwd(), "src", "data", "pipeline-state.json");
    const raw = await readFile(file, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data, { headers: NO_STORE });
  } catch {
    // The data file is missing / malformed: serve the seed with source "pending".
    return NextResponse.json({ ...seed, source: "pending" }, { headers: NO_STORE });
  }
}
