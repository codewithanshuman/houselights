import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookingPacket, checkNumbers, normalizeEvent, tourCalendar } from '../server/operations.mjs';

const snapshot = {
  id: 'source1234', mock: false, input: { city: 'London' }, receipts: [],
  memo: {
    currency: 'GBP', slate: { feasible: true, selectedIds: ['a', 'b'] },
    items: [
      { id: 'a', name: 'Alpha', rank: 1, of: 3, terms: { fee: 1200, available: true }, receipts: ['r1'], claims: [{ id: 'a:rank', text: 'Ranks 1 of 3 returned artists [r1].' }] },
      { id: 'b', name: 'Beta', rank: 2, of: 3, terms: { fee: 900, available: true }, receipts: ['r2'], claims: [{ id: 'b:local', text: 'Geographic popularity results are available for London [r2].' }] }
    ]
  }
};

test('booking packet creates evidence-bound drafts, checklist and RFC calendar', () => {
  const packet = buildBookingPacket(snapshot, {
    name: 'Night One', date: '2026-11-20', venue: 'The Room', contactName: 'Sam', contactEmail: 'sam@example.com',
    holdDeadline: '2026-10-20', contractDeadline: '2026-10-30'
  });
  assert.equal(packet.holdRequests.length, 2);
  assert.ok(packet.holdRequests.every(item => item.status === 'draft_not_sent' && item.numericGuard.passed));
  assert.equal(packet.logisticsChecklist.a.rateConfirmed, true);
  assert.equal(packet.logisticsChecklist.a.contractInvoiceSent, false);
  assert.match(packet.calendarIcs, /BEGIN:VCALENDAR\r\n/);
  assert.ok(packet.calendarIcs.includes('SUMMARY:Night One: Alpha\\, Beta'));
  assert.match(packet.calendarIcs, /SUMMARY:Hold deadline: Night One/);
  assert.ok(packet.calendarIcs.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
});

test('numeric guard visibly strikes unsupported figures', () => {
  const result = checkNumbers('Fee 1200, capacity 999.', ['Buyer fee 1200.']);
  assert.equal(result.passed, false);
  assert.deepEqual(result.struck, ['999']);
  assert.match(result.text, /~~999~~/);
});

test('event validation rejects impossible dates and does not invent one', () => {
  assert.throws(() => normalizeEvent({}, 'London'), /date/);
  assert.throws(() => normalizeEvent({ date: '2026-02-30' }, 'London'), /date/);
  assert.equal(normalizeEvent({ date: '2026-12-01' }, 'London').city, 'London');
});

test('tour calendar exports every routed show and travel leg with qualified venues', () => {
  const routed = { ...snapshot, intelligence: { route: { feasible: true, stops: [
    { sequence: 1, name: 'London', from: 'London', fromKm: 0, travelDays: 0, dayOffBefore: false, showDate: '2026-11-20' },
    { sequence: 2, name: 'Paris', from: 'London', fromKm: 344, travelDays: 1, dayOffBefore: false, showDate: '2026-11-21' }
  ] } }, venuePlan: { stops: [{ market: 'London', selectedVenue: { venueName: 'The Room' } }] } };
  const ics = tourCalendar(routed);
  assert.match(ics, /SUMMARY:Show: Alpha\\, Beta — London/);
  assert.match(ics, /SUMMARY:Travel: London to Paris/);
  assert.match(ics, /LOCATION:The Room\\, London/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(ics.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
});

test('tour calendar expands multi-day transfers without overlapping the inserted rest day', () => {
  const routed = { ...snapshot, intelligence: { route: { feasible: true, stops: [
    { sequence: 1, name: 'Berlin', from: 'London', fromKm: 1000, travelDays: 2, dayOffBefore: true, showDate: '2026-11-04' }
  ] } } };
  const ics = tourCalendar(routed);
  assert.match(ics, /DTSTART;VALUE=DATE:20261102[\s\S]*SUMMARY:Day off before Berlin/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261103[\s\S]*SUMMARY:Travel day 1\/2/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261104[\s\S]*SUMMARY:Travel day 2\/2/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
});
