/**
 * Candle classes mirrored from https://www.thecandlegarden.co/candle-garden-events
 */
import catalog from '../../packages/catalog/classes.json';

export const CLASSES_PAGE_URL = 'https://www.thecandlegarden.co/candle-garden-events';
export const CLASSES_API_URL = 'https://candle-garden-web.vercel.app/api/mobile/classes';

export const classes = Array.isArray(catalog) ? catalog : [];

export async function fetchLatestClasses() {
  const response = await fetch(CLASSES_API_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Class schedule request failed (${response.status})`);
  const payload = await response.json();
  if (!Array.isArray(payload?.classes)) throw new Error('The live class schedule is invalid');
  return { classes: payload.classes, refreshedAt: payload.refreshedAt || null };
}

export function getUpcomingClasses(now = new Date(), sourceClasses = classes) {
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  return sourceClasses.filter((item) => !item.date || item.date >= today).sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (da !== db) return da.localeCompare(db);
    return String(a.time || '').localeCompare(String(b.time || ''));
  });
}

export default classes;
