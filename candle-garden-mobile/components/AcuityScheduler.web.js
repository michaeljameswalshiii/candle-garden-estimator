import React from 'react';

export default function AcuityScheduler({ url }) {
  return React.createElement('iframe', {
    src: url,
    title: 'Schedule Appointment',
    allow: 'payment',
    frameBorder: '0',
    style: {
      width: '100%',
      height: '100%',
      minHeight: 800,
      border: 0,
      backgroundColor: '#fff',
    },
  });
}

