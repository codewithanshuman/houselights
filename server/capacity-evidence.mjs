import { createHash } from 'node:crypto';
import { capacitiesIn, pickCapacity } from './routed/capacity.mjs';

const digest = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const social = /(^|\.)(facebook|twitter|x|instagram|reddit|tiktok|threads|pinterest)\.com$/i;

// Source text is supplied by the organizer. This module never fetches URLs or
// treats a declared URL as proof that a page was independently retrieved.
export function reviewCapacity(venueName, pages) {
  if (typeof venueName !== 'string' || !venueName.trim() || venueName.length > 200) throw new Error('A venue name of 1–200 characters is required.');
  if (!Array.isArray(pages) || !pages.length || pages.length > 5) throw new Error('Provide 1–5 capacity source documents per venue.');
  const seen = new Set(), documents = [], claims = [];
  for (const page of pages) {
    if (!page || typeof page.text !== 'string' || !page.text.trim() || page.text.length > 25000) throw new Error('Each source needs 1–25000 characters of supplied page text.');
    let url;
    try { url = new URL(page.url); } catch { throw new Error('Capacity source URLs must be absolute HTTP(S) URLs.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.length > 1500) throw new Error('Capacity source URLs must use HTTP(S), without credentials, and be at most 1500 characters.');
    url.hash = '';
    const source = url.href;
    if (seen.has(source)) throw new Error('Duplicate source URLs cannot count as independent capacity evidence.');
    seen.add(source);
    const contentDigest = digest(page.text), id = `capacity-${digest(source + '\0' + page.text).slice(7, 23)}`;
    // The original picker supplies the venue-name and social-source gates. Its
    // majority/tie-break decision is deliberately not used to hide conflicts.
    const matched = pickCapacity(venueName, [{ url: source, text: page.text }]);
    const status = social.test(url.hostname) ? 'excluded_social' : matched ? 'claims_found' : 'no_attributed_capacity';
    const rows = status === 'claims_found' ? capacitiesIn(page.text) : [];
    const byValue = new Map(rows.map(row => [row.value, row]));
    documents.push({ id, url: source, contentDigest, status, inputBasis: 'organizer_supplied_text', independentRetrieval: false,
      values: [...byValue.keys()] });
    for (const hit of byValue.values()) claims.push({ capacity: hit.value, quote: hit.quote, source, documentId: id, contentDigest });
  }
  const values = [...new Set(claims.map(claim => claim.capacity))].sort((a, b) => a - b);
  const candidates = values.map(capacity => ({ capacity, sourceCount: claims.filter(claim => claim.capacity === capacity).length,
    claims: claims.filter(claim => claim.capacity === capacity) }));
  return { venueName, status: values.length === 0 ? 'unresolved' : values.length === 1 ? 'consistent' : 'conflict',
    proposedCapacity: values.length === 1 ? values[0] : null, candidates, documents,
    interpretation: 'Extracted claims from organizer-supplied source text, not independently verified capacity. Different layouts, rooms or dates can explain conflicts; confirm the event configuration with the venue.' };
}

export function buildCapacityResearch(snapshot, raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Capacity review options must be an object.');
  if (!snapshot?.intelligence?.route?.feasible) throw new Error('A saved feasible route is required before reviewing venue capacity.');
  if (!Array.isArray(raw.venues) || raw.venues.length < 1 || raw.venues.length > 20) throw new Error('Provide 1–20 routed venues for capacity review.');
  const routeMarkets = new Set(snapshot.intelligence.route.stops.map(stop => stop.name));
  const leads = new Map(snapshot.intelligence.venueScouting.flatMap(group => group.candidates.map(card => [`${group.market}\0${card.id}`, { ...card, receiptId: group.receiptId }])));
  const seen = new Set();
  let totalCharacters = 0;
  const venues = raw.venues.map(row => {
    const key = `${row?.market}\0${row?.venueId}`, lead = leads.get(key);
    if (!lead || !routeMarkets.has(row.market)) throw new Error('Capacity review must reference a Qloo venue candidate on the saved route.');
    if (seen.has(key)) throw new Error('Each venue can appear only once in a capacity review.');
    seen.add(key);
    const report = reviewCapacity(lead.name, row.pages);
    totalCharacters += row.pages.reduce((total, page) => total + page.text.length, 0);
    if (totalCharacters > 100000) throw new Error('Capacity review is limited to 100000 source-text characters per request.');
    return { market: row.market, venueId: row.venueId, qlooReceiptId: lead.receiptId, ...report };
  });
  return { version: '1.0', sourceId: snapshot.id, generatedAt: new Date().toISOString(), venues,
    summary: Object.fromEntries(['consistent', 'conflict', 'unresolved'].map(status => [status, venues.filter(venue => venue.status === status).length])),
    limitations: ['Source documents are organizer-supplied and not independently retrieved; source hashes identify supplied content, not authenticity.',
      'No capacity is selected automatically when extracted values disagree, even if one value has more sources.',
      'The retained Routed parser excludes some side-room and future-building phrases; it cannot reliably infer all configurations or sentence-level attribution.',
      'Availability, price, suitability and commercial terms are separate buyer-entered facts.'] };
}

export function capacityFromReview(snapshot, row) {
  const review = snapshot.capacityResearch?.venues.find(venue => venue.market === row.market && venue.venueId === row.venueId);
  if (!review) throw new Error('No saved capacity review exists for this venue.');
  const value = row.capacity ?? review.proposedCapacity;
  const candidate = review.candidates.find(item => item.capacity === value);
  if (!candidate) throw new Error('Choose an extracted capacity supported by this saved review.');
  const reason = typeof row.capacityDecisionReason === 'string' ? row.capacityDecisionReason.trim() : '';
  if (reason.length > 1000 || (review.status === 'conflict' && !reason)) throw new Error('Conflicting capacities need an explicit capacity and a decision reason of 1–1000 characters.');
  return { capacity: value, capacitySource: candidate.claims.map(claim => claim.source).join('; ').slice(0, 500),
    capacityEvidence: { reviewSourceId: snapshot.id, reviewStatus: review.status, claims: candidate.claims,
      alternatives: review.candidates.filter(item => item.capacity !== value), decisionReason: reason || null,
      basis: 'organizer_selected_source_text', independentRetrieval: false } };
}
