import { getAdminSession } from "@/lib/admin/auth";
import { listSalesOrders } from "@/lib/mobileadmin/data";
import { calculateSalesReport, salesReportCsv } from "@/lib/mobileadmin/sales-report";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await getAdminSession()).ok) return new Response("Unauthorized", { status: 401 });
  const report = calculateSalesReport(await listSalesOrders(), process.env.MOBILE_APP_LAUNCH_DATE);
  return new Response(salesReportCsv(report.monthly), { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="candle-garden-sales.csv"',
    "Cache-Control": "private, no-store",
  } });
}
