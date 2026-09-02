import { NextRequest, NextResponse } from "next/server";
import { loadAdminUsers, requireAdmin } from "@/lib/admin/auth";
import { addStaff, listStaff, removeStaff, setStaffPassword } from "@/lib/admin/staff";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const owners = loadAdminUsers().map((user) => ({
    id: user.id,
    source: "env" as const,
    createdAt: "",
  }));
  const extra = (await listStaff()).map((user) => ({
    id: user.id,
    source: "staff" as const,
    createdAt: user.createdAt,
  }));
  return NextResponse.json({ users: [...owners, ...extra] });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const user = await addStaff({
      id: String(body.id || body.email || ""),
      password: String(body.password || ""),
      createdBy: session.id,
    });
    return NextResponse.json({ user: { id: user.id, source: "staff", createdAt: user.createdAt } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add that login." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    await setStaffPassword(String(body.id || ""), String(body.password || ""));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update password." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (id.toLowerCase() === session.id.toLowerCase()) {
    return NextResponse.json({ error: "You cannot remove your own login." }, { status: 400 });
  }
  if (loadAdminUsers().some((user) => user.id.toLowerCase() === id.toLowerCase())) {
    return NextResponse.json({ error: "Owner accounts cannot be removed here." }, { status: 400 });
  }
  try {
    await removeStaff(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not remove that login." },
      { status: 400 }
    );
  }
}
