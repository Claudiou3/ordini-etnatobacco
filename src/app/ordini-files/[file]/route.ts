import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Servi i file Excel degli ordini generati (data/orders/).
 * URL: /ordini-files/<nome-file>
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const safe = path.basename(file); // evita path traversal
  const filePath = path.join(process.cwd(), "data", "orders", safe);

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
