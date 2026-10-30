// Exchange rates for plans in a local currency. Fee tiers are in US dollars, so a plan in rupees
// converts each estimated fee at a published rate. Rates come from Frankfurter (European Central
// Bank reference rates, no key). A failed lookup refuses the currency; a rate is never guessed.
export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP'];
const ENDPOINT = 'https://api.frankfurter.dev/v1/latest', TTL_MS = 6 * 36e5, TIMEOUT_MS = 6000;
const UNAVAILABLE = 'Exchange rates are unavailable just now. Plan in USD, or try again shortly.';
let cached = null;

/** { rate, date, source } for one USD in `currency`. Throws when the rate is unavailable. */
export async function usdRate(currency, { fetcher = fetch, now = Date.now() } = {}) {
  if (currency === 'USD') return { rate: 1, date: null, source: null };
  if (!CURRENCIES.includes(currency)) throw Object.assign(new Error('Choose USD, INR, EUR or GBP.'), { status: 400 });
  if (!cached || now - cached.at > TTL_MS) {
    let body;
    try {
      const response = await fetcher(`${ENDPOINT}?base=USD&symbols=${CURRENCIES.filter(item => item !== 'USD').join(',')}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Rates returned ${response.status}.`);
      body = await response.json();
    } catch { throw Object.assign(new Error(UNAVAILABLE), { status: 503 }); }
    cached = { at: now, date: String(body?.date ?? ''), rates: body?.rates ?? {} };
  }
  const rate = cached.rates[currency];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) throw Object.assign(new Error(UNAVAILABLE), { status: 503 });
  return { rate, date: cached.date, source: 'European Central Bank reference rate via Frankfurter' };
}
export const clearRates = () => { cached = null; };
