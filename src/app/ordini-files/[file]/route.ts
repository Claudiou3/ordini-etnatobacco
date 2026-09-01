import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { appDataPath } from "@/lib/data-dir";
import { downloadOrderExcel } from "@/lib/orders/storage";

/**
 * Servi i file Excel degli ordini generati (Supabase Storage se disponibile,
 * altrimenti data/orders/).
 * URL: /ordini-files/<nome-file>
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const safe = path.basename(file); // evita path traversal

  // 1) Supabase Storage (online).
  const remote = await downloadOrderExcel(safe);
  if (remote) {
    return new NextResponse(new Uint8Array(remote), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safe}"`,
      },
    });
  }

  // 2) File locale.
  const filePath = appDataPath("orders", safe);
  try {
    const buf = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safe}"`,
      },
    });
  } catch {
    return new NextResponse("File non trovato", { status: 404 });
  }
}
