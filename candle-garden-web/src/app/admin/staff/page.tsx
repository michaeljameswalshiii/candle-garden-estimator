import { getAdminSession } from "@/lib/admin/auth";
import { StaffDesk } from "@/components/admin/desks";

export default async function StaffPage() {
  const session = await getAdminSession();
  return <StaffDesk currentId={session.id} />;
}
