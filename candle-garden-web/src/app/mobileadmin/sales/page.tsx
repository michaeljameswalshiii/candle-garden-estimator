import { getAdminSession } from "@/lib/admin/auth";
import { listSalesOrders } from "@/lib/mobileadmin/data";
import { calculateSalesReport, SALES_COLUMNS, salesMonthValues } from "@/lib/mobileadmin/sales-report";

export const dynamic = "force-dynamic";
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default async function SalesPage() {
  if (!(await getAdminSession()).ok) return null;
  const report = calculateSalesReport(await listSalesOrders(), process.env.MOBILE_APP_LAUNCH_DATE);
  return <>
    <div className="mobileadmin-heading"><div><p>Triple I fee agreement</p><h1>Sales report</h1></div><a href="/api/mobileadmin/sales">Download CSV</a></div>
    <section className="mobileadmin-stats">
      <article><span>Cumulative Net App Sales</span><strong>{money(report.cumulativeNet)}</strong><small>{report.launchDate ? 'Since ' + report.launchDate : "Launch date not set"}</small></article>
      {report.milestones.map(milestone => <article key={milestone.amount}><span>{money(milestone.amount)} milestone</span><strong>{milestone.dateReached ? "Reached" : "Not reached"}</strong><small>{milestone.dateReached || "$1,000 due when reached"}</small></article>)}
    </section>
    <p>Paid app orders only. Net excludes discounts, tax, shipping and refunds. Each milestone triggers $1,000; sales above $6,000 incur 5%. Monthly payments are due by the 8th of the following month.</p>
    <p>Dates and months use UTC. Refunds restate the original order month and fees. Missing tax is treated as zero; stored refill shipping is excluded. Gross is the pre-discount checkout amount, including any tax and shipping.</p>
    <div className="mobileadmin-table-wrap"><table><caption>Monthly app sales and fees (USD)</caption><thead><tr>{SALES_COLUMNS.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>
      {report.monthly.map(row => <tr key={row.month}>{salesMonthValues(row).map((value, index) => <td key={index}>{index >= 2 && index <= 11 ? money(Number(value)) : value}</td>)}</tr>)}
      {!report.monthly.length && <tr><td colSpan={SALES_COLUMNS.length}>No qualifying paid app orders.</td></tr>}
    </tbody></table></div>
  </>;
}
