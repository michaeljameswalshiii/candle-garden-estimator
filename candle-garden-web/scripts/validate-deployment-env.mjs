const isVercelBuild = process.env.VERCEL === "1";

if (!isVercelBuild) {
  console.log("Deployment environment check skipped outside Vercel.");
  process.exit(0);
}

const hasAwsCredentials = Boolean(
  process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim(),
);
const missing = hasAwsCredentials
  ? []
  : ["AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY"];

if (missing.length > 0) {
  console.error(
    `Missing required Vercel environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
  );
  console.error(
    "Add the secret for this deployment environment, then redeploy.",
  );
  process.exit(1);
}

console.log("Required deployment environment variables are configured.");
