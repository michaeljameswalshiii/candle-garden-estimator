import React, { useEffect } from 'react';
import { ACUITY_EMBED_SCRIPT, ACUITY_SCHEDULER_URL } from '../lib/schedulingConfig';

export default function AcuityScheduler() {
  useEffect(() => {
    if (document.getElementById('acuity-embed-js')) return undefined;
    const script = document.createElement('script');
    script.id = 'acuity-embed-js';
    script.src = ACUITY_EMBED_SCRIPT;
    script.type = 'text/javascript';
    document.body.appendChild(script);
    return undefined;
  }, []);

  return React.createElement('iframe', {
    src: ACUITY_SCHEDULER_URL,
    title: 'Schedule Appointment',
    width: '100%',
    height: '800',
    frameBorder: '0',
    allow: 'payment',
    style: {
      width: '100%',
      height: '100%',
      minHeight: 800,
      border: 0,
      backgroundColor: '#fff',
    },
  });
}
