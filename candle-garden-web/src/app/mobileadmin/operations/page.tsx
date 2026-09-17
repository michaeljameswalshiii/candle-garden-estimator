import { IntegrationsCenter } from "@/components/mobileadmin/IntegrationsCenter";
import { JobsCenter } from "@/components/mobileadmin/JobsCenter";
import { SquarespaceConnect } from "@/components/mobileadmin/SquarespaceConnect";

export default function MobileOperationsPage() {
  return (
    <>
      <div className="mobileadmin-page-head">
        <p>Operations center</p>
        <h1>Jobs &amp; app health</h1>
        <span>
          Run automations, review every execution, and see the status of every API the mobile
          app depends on.
        </span>
      </div>
      <SquarespaceConnect />
      <JobsCenter />
      <IntegrationsCenter />
      <div className="mobileadmin-callout" style={{ margin: "28px 0 18px" }}>
        <div>
          <p>Store submission</p>
          <h2>App Store / Play readiness</h2>
          <span>
            Runtime 1.1.0 is on the production OTA channel. Before the next store binary: set
            APPLE_TEAM_ID and ANDROID_SHA256_CERT_FINGERPRINTS on Vercel so Universal Links /
            App Links files are not empty, then verify /.well-known responses and a TestFlight
            checkout return.
          </span>
        </div>
        <a href="/.well-known/apple-app-site-association" target="_blank" rel="noreferrer">
          Check iOS AASA
        </a>
      </div>
      <div className="mobileadmin-callout" style={{ margin: "28px 0 18px" }}>
        <div>
          <p>Team access</p>
          <h2>Add or remove administrators</h2>
          <span>
            Staff accounts use the same secure sign-in and can access both owner consoles.
            Role-specific permissions are the next access-control layer.
          </span>
        </div>
        <a href="/admin/staff">Manage staff access</a>
      </div>
    </>
  );
}
