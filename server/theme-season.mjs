import { generateSchedule, pickWeakDates, weekdayOf, defaultSegment, SPORTS, SEGMENTS } from './theme-night/schedule.mjs';
import { sensitiveTopic, identityTheme, isAlcoholBrand, isDrinkingSpot, isYoungCrowd } from './theme-night/sensitivity.mjs';
import { scoreWithUncertainty } from './festival-research.mjs';

export function planDates(raw = {}) {
  const count = raw.count ?? 4, gapDays = raw.gapDays ?? 9;
  if (!Number.isInteger(count) || count < 1 || count > 8 || !Number.isInteger(gapDays) || gapDays < 0 || gapDays > 365) throw new Error('Choose 1–8 nights and a 0–365 day gap.');
  let dates = raw.dates;
  const synthetic = dates == null;
  if (synthetic) {
    if (!Object.hasOwn(SPORTS, raw.sport)) throw new Error('Supply dates or a supported sport: baseball, basketball, hockey, soccer, football.');
    dates = generateSchedule(raw.sport);
  }
  if (!Array.isArray(dates) || !dates.length || dates.length > 366) throw new Error('Provide 1–366 dates.');
  const seen = new Set();
  const normalized = dates.map(row => {
    const date = row?.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || seen.has(date)) throw new Error('Dates must be valid, unique YYYY-MM-DD values.');
    seen.add(date);
    if (!['day', 'night'].includes(row.time)) throw new Error('Each date needs day or night time.');
    const weekday = weekdayOf(date), segment = row.segment ?? defaultSegment(weekday, row.time, Number(date.slice(5, 7)));
    if (!Object.hasOwn(SEGMENTS, segment)) throw new Error('Unsupported audience segment.');
    return { date, time: row.time, weekday, segment, target: false };
  });
  const planned = pickWeakDates(normalized, count, gapDays), selected = planned.filter(row => row.target);
  return { dates: planned, selected, requestedCount: count, scheduledCount: selected.length, synthetic,
    method: 'Weekday/season weakness heuristic with rotating segments and minimum date spacing.',
    warnings: [...(synthetic ? ['Generated sports dates are synthetic 2026–2027 examples, not actual fixtures.'] : []),
      ...(selected.length < count ? ['The spacing rule prevents selecting the requested number of nights.'] : []),
      'Weakness is a programming heuristic, not observed attendance. Audience segments are organizer planning categories.'] };
}

export function buildThemeSeason(snapshot, raw = {}, researchContext = null) {
  const research = snapshot.festivalResearch;
  if (!research) throw new Error('Run festival GM research before building themed nights.');
  const dates = planDates(raw), market = research.markets.find(item => item.city === (raw.city ?? research.input.city));
  if (!market) throw new Error('Choose a city from this saved Market DNA report.');
  const ipPolicy = raw.ipPolicy ?? 'ip_light';
  if (!['ip_light', 'licensed_ok'].includes(ipPolicy)) throw new Error('Unsupported IP planning policy.');
  const candidates = (researchContext?.domains ?? market.domains).flatMap(domain => domain.entities.filter(card => !sensitiveTopic(card)).map((card, index) => ({
    ...card, receiptId: domain.evidence,
    score: scoreWithUncertainty({ localAffinity: domain.entities.length > 1 ? 1 - index / (domain.entities.length - 1) : .5 })
  }))).sort((a, b) => b.score.total - a.score.total || a.id.localeCompare(b.id));
  if (!candidates.length) throw new Error('No usable theme anchors were returned by this market scan.');
  const used = new Set(), usedBrands = new Set(), warnings = [...dates.warnings];
  const kits = Object.fromEntries(research.experience.map(kit => [kit.target, kit]));
  const nights = [...dates.selected].sort((a, b) => a.date.localeCompare(b.date)).map((date, index) => {
    const scored = candidates.map(card => {
      const row = researchContext?.matrix?.find(domain => domain.kind === card.kind)?.rows.find(row => row.id === card.id);
      if (!row) return card;
      return { ...card, score: scoreWithUncertainty({ localAffinity: row.local.utility, segmentFit: row.segments[date.segment]?.utility }),
        audienceEvidence: row.segments[date.segment], localEvidence: row.local, referenceLift: row.referenceLift,
        scoreReceipts: [row.local.receiptId, ...(row.segments[date.segment]?.receiptIds ?? [])].filter(Boolean) };
    }).sort((a, b) => b.score.total - a.score.total || a.id.localeCompare(b.id));
    const overrideId = researchContext?.anchorOverrides?.[date.date];
    const reserved = new Set(Object.entries(researchContext?.anchorOverrides ?? {}).filter(([key]) => key !== date.date).map(([, id]) => id));
    const available = scored.filter(card => !used.has(card.id) && !reserved.has(card.id));
    const anchor = overrideId ? scored.find(card => card.id === overrideId) : available[0] ?? scored[0];
    if (used.has(anchor.id)) warnings.push(`Repeated theme anchor ${anchor.name} on ${date.date}.`);
    used.add(anchor.id);
    const label = { movie: 'Movie Buffs', tv_show: 'Binge-Watchers', artist: 'Music', videogame: 'Gamers', book: 'Book Club' }[anchor.kind];
    const named = `${anchor.name} Night`;
    const title = ipPolicy === 'licensed_ok' && !identityTheme(named) ? named : `${label} Night ${index + 1}`;
    const partner = target => (kits[target]?.candidates ?? []).filter(card => !sensitiveTopic(card) &&
      !(isYoungCrowd(date.segment) && (isAlcoholBrand(card) || target === 'place' && isDrinkingSpot(card))));
    const brands = partner('brand'), sponsors = [...brands.filter(card => !usedBrands.has(card.id)), ...brands.filter(card => usedBrands.has(card.id))].slice(0, 2);
    sponsors.forEach(card => usedBrands.add(card.id));
    return { ...date, title, anchor, tasteFit: anchor.score,
      selection: { method: overrideId ? 'organizer_override' : 'highest_policy_score_without_repetition',
        alternatives: available.filter(card => card.id !== anchor.id).slice(0, 5).map(card => ({ id: card.id, name: card.name, kind: card.kind, score: card.score })) },
      supporting: [], sponsors, playlist: partner('artist').slice(0, 6), localPartners: partner('place').slice(0, 2), mediaPartner: partner('podcast')[0] ?? null,
      experienceBasis: 'Shared festival-slate audience research; these leads were not researched separately for this theme anchor.',
      giveaway: { movie: 'Poster-style keepsake', tv_show: 'Collectible trading cards', artist: 'LED wristbands', videogame: 'Scavenger-hunt passport', book: 'Reading-challenge bookmark' }[anchor.kind],
      activations: ['Fandom trivia', 'Organizer-reviewed themed concessions', 'Opt-in audience challenge'],
      promo: { headline: `${title} · ${date.date}`, social: `Explore ${title} with your festival community.`, emailSubject: `Save the date: ${title}` },
      rights: { status: 'review_required', policy: ipPolicy, note: 'No permission is inferred from Qloo metadata or from inspired-by wording.' },
      evidence: [...new Set([anchor.receiptId, ...(anchor.scoreReceipts ?? []), ...Object.values(kits).map(kit => kit.receiptId)])] };
  });
  return { sourceId: snapshot.id, city: market.city, dates, nights, warnings,
    limitations: ['Theme scores use within-domain scan ranks. Segment-specific theme ranking has not been run, and the four remaining score components are marked estimated.',
      'This programs themes around a festival decision; it does not book artists for multiple dates or establish date-specific availability.',
      'Partner filtering relies on available labels and tags and requires organizer suitability review.'] };
}
