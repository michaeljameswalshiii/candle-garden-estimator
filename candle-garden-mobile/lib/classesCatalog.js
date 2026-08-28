/**
 * Candle classes mirrored from https://www.thecandlegarden.co/candle-garden-events
 * Snapshot for reliable offline display; "Book" opens the live site.
 */
import catalog from './classesCatalog.json';

export const CLASSES_PAGE_URL = 'https://www.thecandlegarden.co/candle-garden-events';

/** @type {Array<object>} */
export const classes = Array.isArray(catalog) ? catalog : [];

export function getUpcomingClasses(now = new Date()) {
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  return classes.filter((item) => !item.date || item.date >= today).sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (da !== db) return da.localeCompare(db);
    return String(a.time || '').localeCompare(String(b.time || ''));
  });
}

export default classes;
