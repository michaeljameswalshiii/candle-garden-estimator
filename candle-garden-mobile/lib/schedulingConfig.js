import { CLASSES_PAGE_URL } from './classesCatalog';

/** Live booking is Squarespace Commerce on the website, not Acuity. */
export const BOOKING_PAGE_URL = CLASSES_PAGE_URL;

export const ACUITY_OWNER_ID = '32288720';

/** Kept for reference. Acuity trial/subscription is paused (Sep 2026). */
export const ACUITY_SCHEDULER_URL =
  `https://app.acuityscheduling.com/schedule.php?owner=${ACUITY_OWNER_ID}&ref=embedded_csp`;

export const ACUITY_EMBED_SCRIPT = 'https://embed.acuityscheduling.com/js/embed.js';

/** Official Squarespace events page (working class checkout). */
export const ACUITY_EMBED_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #fff; }
    </style>
    <meta http-equiv="refresh" content="0;url=${BOOKING_PAGE_URL}" />
  </head>
  <body></body>
</html>`;
