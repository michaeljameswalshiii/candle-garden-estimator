import { runAdminHttp } from "./admin.mjs";
import { runMobileApi } from "./mobile-api.mjs";
import { runStorefrontHttp } from "./storefront.mjs";

const storefront = await runStorefrontHttp();
const admin = await runAdminHttp();
const mobile = await runMobileApi();
const results = [storefront, admin, mobile];
console.log(JSON.stringify({ results }, null, 2));
if (results.some((item) => !item.ok)) process.exit(1);
