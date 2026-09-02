import { classes, upcomingClasses } from "@/lib/catalog";

export default function AdminClassesPage() {
  const upcoming = new Set(upcomingClasses().map((item) => item.id));
  return (
    <>
      <p className="eyebrow">Classes</p>
      <h1>Candle classes</h1>
      <p className="admin-lede">
        {classes.length} dates in the catalog. Booking still happens on the live
        Squarespace events page.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Class</th>
              <th>When</th>
              <th>Price</th>
              <th>Seats</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.title}</strong>
                </td>
                <td>{item.scheduleLabel}</td>
                <td>${item.price}</td>
                <td>{item.available}</td>
                <td>
                  {item.soldOut
                    ? "Sold out"
                    : upcoming.has(item.id)
                      ? "Upcoming"
                      : "Past"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
