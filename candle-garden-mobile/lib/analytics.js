/**
 * Lightweight analytics for store-readiness and funnel debugging.
 * Safe no-op if logging fails. Swap transport later without touching screens.
 */
import Constants from 'expo-constants';

const BUFFER_LIMIT = 40;
const buffer = [];

function meta() {
  return {
    appOwnership: Constants.appOwnership || 'unknown',
    runtime: Constants.expoConfig?.runtimeVersion || Constants.expoConfig?.version || 'unknown',
    platform: Constants.platform?.ios ? 'ios' : Constants.platform?.android ? 'android' : 'unknown',
  };
}

export function track(event, props = {}) {
  const entry = {
    event: String(event || 'unknown'),
    props: props && typeof props === 'object' ? props : {},
    at: new Date().toISOString(),
    ...meta(),
  };
  buffer.push(entry);
  if (buffer.length > BUFFER_LIMIT) buffer.shift();
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[analytics]', entry.event, entry.props);
  }
  return entry;
}

export function recentEvents() {
  return buffer.slice();
}

export default { track, recentEvents };
