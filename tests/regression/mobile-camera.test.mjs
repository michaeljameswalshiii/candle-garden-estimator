import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT } from "./helpers.mjs";

function isJpegBase64(base64) {
  if (!base64 || typeof base64 !== "string") return false;
  return base64.replace(/\s/g, "").startsWith("/9j/");
}

const fixture = path.join(ROOT, "candle-garden-mobile/assets/lifestyle/red-currant.jpg");
const prepare = fs.readFileSync(path.join(ROOT, "candle-garden-mobile/lib/prepareImage.js"), "utf8");
const estimator = fs.readFileSync(
  path.join(ROOT, "candle-garden-mobile/screens/EstimatorScreen.js"),
  "utf8",
);
const detector = fs.readFileSync(
  path.join(ROOT, "candle-saas-cdk/lambda_functions/container_detector/index.py"),
  "utf8",
);

test("estimator can open the camera and the photo library", () => {
  assert.match(estimator, /launchCameraAsync/);
  assert.match(estimator, /launchImageLibraryAsync/);
  assert.match(estimator, /requestCameraPermissionsAsync/);
  assert.match(estimator, /prepareImageForDetect/);
  assert.match(estimator, /Compatible/);
});

test("estimator renders symbols instead of literal Unicode escape codes", () => {
  assert.doesNotMatch(estimator, /build: ups-ground-saver-v1 \\u00b7/);
  assert.doesNotMatch(estimator, /scale only \\u2014/);
  assert.doesNotMatch(estimator, />\\ud83d\\udcf7</);
  assert.doesNotMatch(estimator, />How we\\u2019ll ship</);
  assert.doesNotMatch(estimator, />\\u2022 /);
  assert.doesNotMatch(estimator, /in \\u00b7 empty/);
});

test("iPhone HEIC photos are converted to JPEG before /detect", () => {
  assert.match(prepare, /export function isJpegBase64/);
  assert.match(prepare, /HEIC/);
  assert.match(prepare, /SaveFormat\.JPEG/);
  assert.match(detector, /heic/);
  assert.match(detector, /Never invent a volume quote on failure/);
});

test("the vision fixture is a real JPEG the detector can accept", () => {
  const bytes = fs.readFileSync(fixture);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.equal(isJpegBase64(bytes.toString("base64")), true);
  assert.equal(isJpegBase64("AAAA"), false);
  assert.equal(isJpegBase64(""), false);
});
