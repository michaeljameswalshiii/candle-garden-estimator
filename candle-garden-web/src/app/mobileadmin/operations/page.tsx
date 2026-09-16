const checks = [
  { label: "Orders database", detail: "DynamoDB order history", status: "Connected" },
  { label: "Customer accounts", detail: "Amazon Cognito authentication", status: "Connected" },
  { label: "Payments", detail: "Stripe checkout status and failures", status: "Needs reporting" },
  { label: "App analytics", detail: "Screens, sessions, funnels, retention", status: "Needs connection" },
  { label: "Store downloads", detail: "Apple App Store and Google Play", status: "Needs connection" },
  { label: "Push notifications", detail: "Delivery, opens, and failures", status: "Needs reporting" },
];
export default function MobileOperationsPage() { return <><div className="mobileadmin-page-head"><p>Operations</p><h1>App health</h1><span>One place to see which operational signals are connected and which still need instrumentation.</span></div><div className="mobileadmin-checks">{checks.map((check) => <article key={check.label}><div><strong>{check.label}</strong><span>{check.detail}</span></div><em className={check.status === "Connected" ? "is-connected" : ""}>{check.status}</em></article>)}</div></>; }
