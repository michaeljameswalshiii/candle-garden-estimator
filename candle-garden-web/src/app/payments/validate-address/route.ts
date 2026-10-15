import { NextRequest, NextResponse } from "next/server";
import { shippoConfigured, validateUsAddress, findUsAddress } from "@/lib/shippo";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(request: NextRequest) {
  try {
    if (!shippoConfigured()) {
      return NextResponse.json(
        { valid: false, message: "Address check is temporarily unavailable. Try again in a moment." },
        { status: 503 },
      );
    }
    const body = await request.json();
    const source = body?.shipping && typeof body.shipping === "object" ? body.shipping : body;
    const result = typeof body?.fullAddress === "string"
      ? await findUsAddress(body.fullAddress)
      : await validateUsAddress(source || {});
    return NextResponse.json(result, { status: result.valid ? 200 : 400 });
  } catch {
    return NextResponse.json(
      { valid: false, message: "Address check is temporarily unavailable. Try again in a moment." },
      { status: 503 },
    );
  }
}
