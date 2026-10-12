const NUM = /\d[\d,]*(?:\.\d+)?/g;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const normNumber = value => value.replace(/,/g, '').replace(/\.0+$/, '');
const unique = values => [...new Set(values)];

function validDate(value) {
  if (!DATE.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function addDays(iso, amount) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function longDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  });
}

export function normalizeEvent(raw, fallbackCity = '') {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (!validDate(value.date)) throw new Error('A valid event date in YYYY-MM-DD format is required.');
  const milestones = {};
  for (const key of ['holdDeadline', 'contractDeadline', 'announcementDate']) {
    if (value[key] != null && !validDate(value[key])) throw new Error(`${key} must use YYYY-MM-DD format.`);
    if (value[key]) milestones[key] = value[key];
  }
  const text = (field, max, fallback = '') => String(value[field] || fallback).trim().slice(0, max);
  return {
    name: text('name', 120, 'Houselights booking'), date: value.date,
    endDate: addDays(value.date, 1), city: text('city', 100, fallbackCity),
    venue: text('venue', 160, 'Venue TBC'), contactName: text('contactName', 100),
    contactEmail: text('contactEmail', 180), notes: text('notes', 500), milestones
  };
}

export function checkNumbers(text, evidenceLines) {
  const allowed = new Set();
  for (const line of evidenceLines) for (const match of line.match(NUM) || []) {
    allowed.add(normNumber(match));
    allowed.add(String(Number(normNumber(match))));
  }
  const struck = [];
  const checked = text.replace(NUM, match => {
    const normalized = normNumber(match);
    if (allowed.has(normalized) || allowed.has(String(Number(normalized)))) return match;
    struck.push(match);
    return `~~${match}~~`;
  });
  return { text: checked, struck: unique(struck), passed: struck.length === 0 };
}

function evidenceFor(snapshot, artist, event) {
  const currency = snapshot.memo.currency || snapshot.input?.currency || 'GBP';
  const lines = [
    `Artist: ${artist.name}.`, `Event: ${event.name}.`, `Event date: ${event.date}.`,
    `City: ${event.city || 'not supplied'}.`, `Venue: ${event.venue}.`
  ];
  if (typeof artist.terms?.fee === 'number') lines.push(`Buyer-entered planning quote: ${currency} ${artist.terms.fee.toFixed(2)}.`);
  lines.push(`Buyer-entered availability: ${artist.terms?.available === true ? 'confirmed' : 'not confirmed'}.`);
  for (const claim of artist.claims || []) lines.push(claim.text);
  return lines;
}

function holdDraft(snapshot, artist, event) {
  const evidenceLines = evidenceFor(snapshot, artist, event);
  const greeting = event.contactName ? `Hi ${event.contactName},` : 'Hello,';
  const rankClaim = (artist.claims || []).find(claim => claim.id.endsWith(':rank'))?.text;
  const localClaim = (artist.claims || []).find(claim => claim.id.endsWith(':local'))?.text;
  const currency = snapshot.memo.currency || snapshot.input?.currency || 'GBP';
  const body = [
    greeting, '',
    `We would like to request a hold for ${artist.name} at ${event.name} in ${event.city || 'the event city'} on ${longDate(event.date)}.`, '',
    typeof artist.terms?.fee === 'number'
      ? `Our current buyer-entered planning quote is ${currency} ${artist.terms.fee.toFixed(2)}; please confirm the final offer and availability.`
      : 'We do not yet have a confirmed quote; please share the final offer and availability.',
    rankClaim || '', localClaim || '', '',
    'Please also confirm set length, load-in, payment terms, contracting contact, and promotional asset requirements.', '',
    'Thanks,'
  ].filter((line, index, rows) => line !== '' || rows[index - 1] !== '').join('\n');
  const subject = `Hold request: ${artist.name} — ${event.name} — ${event.date}`;
  const checkedSubject = checkNumbers(subject, evidenceLines);
  const checkedBody = checkNumbers(body, evidenceLines);
  return {
    artistId: artist.id, artistName: artist.name, recipient: event.contactEmail || null,
    subject: checkedSubject.text, body: checkedBody.text, evidenceLines,
    receiptIds: unique(artist.receipts || []),
    numericGuard: { passed: checkedSubject.passed && checkedBody.passed, struck: unique([...checkedSubject.struck, ...checkedBody.struck]) },
    status: 'draft_not_sent'
  };
}

const escapeIcs = value => String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const compactDay = iso => iso.replace(/-/g, '');
function foldIcs(line) {
  const output = [];
  let current = '';
  for (const character of line) {
    if (Buffer.byteLength(current + character, 'utf8') > 73) { output.push(current); current = ` ${character}`; }
    else current += character;
  }
  output.push(current);
  return output;
}

function calendarEvent(uid, start, end, summary, description, location, stamp, transparent = false) {
  return [
    'BEGIN:VEVENT', `UID:${uid}@houselights`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compactDay(start)}`, `DTEND;VALUE=DATE:${compactDay(end)}`,
    `SUMMARY:${escapeIcs(summary)}`, ...(location ? [`LOCATION:${escapeIcs(location)}`] : []),
    `DESCRIPTION:${escapeIcs(description)}`, ...(transparent ? ['TRANSP:TRANSPARENT'] : []), 'END:VEVENT'
  ];
}

export function bookingCalendar(snapshot, event) {
  const selected = new Set(snapshot.memo.slate?.selectedIds || []);
  const artists = snapshot.memo.items.filter(item => selected.has(item.id));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lineup = artists.map(item => item.name).join(', ');
  const events = calendarEvent(
    `${snapshot.id}-${event.date}-show`, event.date, event.endDate, `${event.name}: ${lineup}`,
    [`Selected slate: ${lineup}.`, `Planning source: Houselights ${snapshot.id}.`, 'Fees and availability remain buyer-entered assumptions until contracted.', event.notes].filter(Boolean).join('\n'),
    [event.venue, event.city].filter(Boolean).join(', '), stamp
  );
  const labels = { holdDeadline: 'Hold deadline', contractDeadline: 'Contract deadline', announcementDate: 'Announcement date' };
  for (const [key, date] of Object.entries(event.milestones)) {
    events.push(...calendarEvent(`${snapshot.id}-${date}-${key}`, date, addDays(date, 1), `${labels[key]}: ${event.name}`, `Operational milestone for ${event.name}.`, '', stamp, true));
  }
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Houselights//Booking packet//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeIcs(event.name)}`, ...events, 'END:VCALENDAR'
  ];
  return lines.flatMap(foldIcs).join('\r\n') + '\r\n';
}

export function buildBookingPacket(snapshot, rawEvent) {
  if (!snapshot?.memo?.slate?.feasible) throw new Error('A feasible saved slate is required to build a booking packet.');
  const event = normalizeEvent(rawEvent, snapshot.input?.city || snapshot.memo.input?.city || '');
  const selected = new Set(snapshot.memo.slate.selectedIds);
  const artists = snapshot.memo.items.filter(item => selected.has(item.id));
  return {
    version: '1.0', sourceId: snapshot.id, mode: snapshot.mock ? 'synthetic' : 'live', event,
    holdRequests: artists.map(artist => holdDraft(snapshot, artist, event)),
    logisticsChecklist: Object.fromEntries(artists.map(artist => [artist.id, {
      dateConfirmed: true, rateConfirmed: typeof artist.terms?.fee === 'number',
      contactConfirmed: !!event.contactEmail, setLengthConfirmed: false, loadInConfirmed: false,
      paymentConfirmed: false, promoAssetsSent: false, contractInvoiceSent: false
    }])),
    calendarIcs: bookingCalendar(snapshot, event),
    caveat: 'Drafts are generated only from saved evidence and buyer-entered terms. Nothing is sent and no booking is represented as confirmed.'
  };
}
