import { expect, test } from "@playwright/test";
import run from "../browser/storefront.mjs";

test("storefront regression", async ({ page }) => {
  const result = await run(page);
  expect(result.failures, result.failures.join("\n")).toEqual([]);
});
