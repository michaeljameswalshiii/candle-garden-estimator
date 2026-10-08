/** Bound the request and body read so offline screens always reach an end state. */
export async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Refresh failed (${response.status})`);
        return response.json();
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Refresh timed out. Please try again.')); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
