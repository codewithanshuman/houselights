// All persisted monetary values are integer minor units. Inputs may be decimal
// strings or JSON numbers with no more than two decimal places.
export const currencies = new Set(['GBP', 'USD', 'EUR', 'INR']);
export function minor(value, label = 'Amount') {
  const raw = String(value);
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(raw)) throw new Error(`${label} must be a non-negative amount with at most two decimal places.`);
  const [whole, fraction = ''] = raw.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error(`${label} is outside the supported currency range.`);
  return result;
}
export function checked(value, label = 'Calculated amount') {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} exceeded safe integer minor units.`);
  return value;
}
export function signedMinor(value, label = 'Amount') {
  const raw = String(value);
  return raw.startsWith('-') ? -minor(raw.slice(1), label) : minor(raw, label);
}
export const major = cents => checked(cents) / 100;
export const sum = values => checked(values.reduce((a, b) => checked(a + b), 0));
export function ratio(cents, rate) {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error('Rate must be between 0 and 1.');
  return checked(Math.round(cents * rate));
}
