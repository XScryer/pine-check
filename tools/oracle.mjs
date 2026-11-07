// Oracle client for TradingView's Pine facade.
// The endpoint is undocumented internal infrastructure used by TradingView's
// own web editor. It may change or disappear without notice — callers must
// treat failures as "oracle unavailable", never as "code is valid".

const BASE = 'https://pine-facade.tradingview.com/pine-facade';

export const ORACLE_ENDPOINTS = {
  light: `${BASE}/translate_light?user_name=admin&v=3`,
  full: `${BASE}/translate?user_name=admin&v=3`,
};

const HEADERS = {
  Referer: 'https://www.tradingview.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
};

/**
 * Send Pine source to the facade and return the parsed JSON response.
 * @param {string} source   Pine Script source code
 * @param {object} [opts]
 * @param {'light'|'full'} [opts.endpoint='light']
 * @param {'field'|'file'} [opts.mode='field']  how `source` is attached to the form — the facade only accepts a plain field
 * @param {number} [opts.timeoutMs=20000]
 * @param {number} [opts.retries=2]
 * @returns {Promise<{ok:boolean, status:number, json?:any, error?:string}>}
 */
export async function oracleCheck(source, opts = {}) {
  const { endpoint = 'light', mode = 'field', timeoutMs = 20000, retries = 2 } = opts;
  const url = ORACLE_ENDPOINTS[endpoint];
  if (!url) return { ok: false, status: 0, error: `unknown endpoint ${endpoint}` };

  const form = new FormData();
  if (mode === 'file') {
    form.append('source', new Blob([source], { type: 'text/plain' }), 'source.pine');
  } else {
    form.append('source', source);
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: HEADERS,
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = undefined; }
      return { ok: res.ok && json !== undefined, status: res.status, json, raw: json ? undefined : text.slice(0, 500) };
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return { ok: false, status: 0, error: String(lastErr) };
}

/**
 * Extract the error list from a facade response.
 * Shape observed: { success, result: { errors: [{code, ctx, message, start, end}] } }
 */
export function oracleErrors(resp) {
  const errs = resp?.json?.result?.errors;
  return Array.isArray(errs) ? errs : [];
}

/** Polite delay between bulk probes (ms). */
export const POLITE_DELAY_MS = 120;
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
