import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { MobileAdminShell } from "@/components/mobileadmin/MobileAdminShell";
import { getAdminSession } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Candle Garden Mobile Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MobileAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session.ok) return <AdminLogin />;
  return <MobileAdminShell id={session.id}>{children}</MobileAdminShell>;
}
