import React from 'react';
import { BOOKING_PAGE_URL } from '../lib/schedulingConfig';

export default function AcuityScheduler() {
  return React.createElement('iframe', {
    src: BOOKING_PAGE_URL,
    title: 'Book a class',
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
