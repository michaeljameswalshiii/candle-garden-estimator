export const ACUITY_OWNER_ID = '32288720';

export const ACUITY_SCHEDULER_URL =
  `https://app.acuityscheduling.com/schedule.php?owner=${ACUITY_OWNER_ID}&ref=embedded_csp`;

export const ACUITY_EMBED_SCRIPT = 'https://embed.acuityscheduling.com/js/embed.js';

/** Official Squarespace / Acuity embed (iframe + payment + embed.js). */
export const ACUITY_EMBED_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #fff; }
      iframe { display: block; width: 100%; height: 100%; min-height: 800px; border: 0; }
    </style>
  </head>
  <body>
    <iframe src="${ACUITY_SCHEDULER_URL}" title="Schedule Appointment" width="100%" height="800" frameBorder="0" allow="payment"></iframe>
    <script src="${ACUITY_EMBED_SCRIPT}" type="text/javascript"></script>
  </body>
</html>`;
