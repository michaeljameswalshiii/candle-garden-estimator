import { expect, test } from "@playwright/test";
import run from "../browser/admin.mjs";

test("admin login and desks", async ({ page }) => {
  const result = await run(page);
  if (result.skippedAuth) {
    test.info().annotations.push({ type: "skip-auth", description: "admin credentials unset" });
  }
  expect(result.failures, result.failures.join("\n")).toEqual([]);
});
