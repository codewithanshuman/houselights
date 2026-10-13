const CHECKLIST_KEYS = Object.freeze([
  'dateConfirmed', 'rateConfirmed', 'contactConfirmed', 'setLengthConfirmed',
  'loadInConfirmed', 'paymentConfirmed', 'promoAssetsSent', 'contractInvoiceSent'
]);
const RESPONSE_TYPES = new Set(['accepted', 'negotiating', 'objection', 'declined', 'information', 'no_response']);
const iso = value => new Date(value).toISOString();
const addDays = (value, days) => new Date(new Date(value).valueOf() + days * 86400000).toISOString();
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
const label = (value, fallback = 'unspecified') => String(value || fallback).trim().slice(0, 80) || fallback;

function segmentPerformance(deals, field) {
  const groups = new Map();
  for (const deal of deals.filter(item => item.sentAt)) {
    const key = field === 'pitchAngle' ? label(deal.pitch?.angle) : label(deal.pitch?.venueSegment);
    const row = groups.get(key) || { value: key, outreached: 0, responses: 0, accepted: 0, objections: 0 };
    row.outreached++;
    if (deal.response && deal.response.type !== 'no_response') row.responses++;
    if (['secured', 'logistics_pending', 'show_scheduled'].includes(deal.stage)) row.accepted++;
    if (deal.response?.type === 'objection') row.objections++;
    groups.set(key, row);
  }
  return [...groups.values()].map(row => ({ ...row,
    responseRate: row.outreached ? money(row.responses / row.outreached * 100) : 0,
    acceptanceRate: row.outreached ? money(row.accepted / row.outreached * 100) : 0
  })).sort((a, b) => b.accepted - a.accepted || b.responses - a.responses || a.value.localeCompare(b.value));
}

function emptyChecklist(item) {
  return {
    dateConfirmed: false, rateConfirmed: typeof item.terms?.fee === 'number', contactConfirmed: false,
    setLengthConfirmed: false, loadInConfirmed: false, paymentConfirmed: false,
    promoAssetsSent: false, contractInvoiceSent: false
  };
}

function refresh(pipeline) {
  const deals = pipeline.deals;
  const stageCounts = {};
  for (const deal of deals) stageCounts[deal.stage] = (stageCounts[deal.stage] || 0) + 1;
  const outreached = deals.filter(deal => deal.sentAt).length;
  const responses = deals.filter(deal => deal.response && deal.response.type !== 'no_response').length;
  const accepted = deals.filter(deal => ['secured', 'logistics_pending', 'show_scheduled'].includes(deal.stage)).length;
  const declined = deals.filter(deal => deal.stage === 'declined').length;
  const objections = {};
  for (const deal of deals) if (deal.response?.type === 'objection') {
    const key = deal.response.objectionCategory || deal.response.objection || 'unspecified'; objections[key] = (objections[key] || 0) + 1;
  }
  const rates = deals.map(deal => deal.agreedRate).filter(Number.isFinite);
  const nextActions = [];
  for (const deal of deals) {
    if (deal.stage === 'research_complete') nextActions.push({ artistId: deal.artistId, action: 'approve_pitch' });
    else if (deal.stage === 'pitch_approved') nextActions.push({ artistId: deal.artistId, action: 'send_outreach' });
    else if (deal.stage === 'sent') {
      const next = deal.followUps.find(item => item.status === 'scheduled');
      nextActions.push({ artistId: deal.artistId, action: next ? 'follow_up' : 'record_response', dueAt: next?.dueAt || null });
    } else if (['secured', 'logistics_pending'].includes(deal.stage)) nextActions.push({ artistId: deal.artistId, action: 'complete_logistics' });
  }
  pipeline.analytics = {
    totalDeals: deals.length, outreached, responses, accepted, declined, stageCounts, objections,
    responseRate: outreached ? money(responses / outreached * 100) : 0,
    acceptanceRate: outreached ? money(accepted / outreached * 100) : 0,
    averageAgreedRate: rates.length ? money(rates.reduce((sum, rate) => sum + rate, 0) / rates.length) : null,
    byPitchAngle: segmentPerformance(deals, 'pitchAngle'), byVenueSegment: segmentPerformance(deals, 'venueSegment'),
    totalCommittedFee: money(rates.reduce((sum, rate) => sum + rate, 0)), nextActions
  };
  const feedback = [];
  if (outreached >= 3 && pipeline.analytics.responseRate < 25) feedback.push('Response rate is below 25%; review targeting and the evidence used in hold requests.');
  const topObjection = Object.entries(objections).sort((a, b) => b[1] - a[1])[0];
  if (topObjection) feedback.push(`Most frequent recorded objection: ${topObjection[0]} (${topObjection[1]}).`);
  const pitchSignals = pipeline.analytics.byPitchAngle.filter(row => row.outreached >= 2);
  if (pitchSignals.length > 1) feedback.push(`Observed pitch-angle leader: ${pitchSignals[0].value} (${pitchSignals[0].responses}/${pitchSignals[0].outreached} responses); descriptive history only, not a causal result.`);
  if (accepted) feedback.push(`${accepted} deal${accepted === 1 ? '' : 's'} reached secured or logistics stage; complete the operational checklist before calling the show scheduled.`);
  pipeline.feedback = feedback;
  return pipeline;
}

export function createPipeline(snapshot, now = new Date().toISOString()) {
  if (!snapshot?.memo?.slate?.feasible) throw new Error('A feasible saved slate is required to start a booking pipeline.');
  const selected = new Set(snapshot.memo.slate.selectedIds);
  const deals = snapshot.memo.items.filter(item => selected.has(item.id)).map(item => ({
    artistId: item.id, artistName: item.name, stage: 'research_complete',
    proposedRate: item.terms?.fee ?? null, agreedRate: null, sentAt: null, response: null,
    pitch: { angle: null, venueSegment: null, draft: null, approvedAt: null }, outreach: null,
    negotiation: { counteroffers: [] },
    checklist: emptyChecklist(item), followUps: [], notes: [], updatedAt: iso(now)
  }));
  return refresh({
    version: '1.0', revision: 0, sourceId: snapshot.id, createdAt: iso(now), updatedAt: iso(now), deals,
    events: [{ id: 'e1', type: 'pipeline_created', at: iso(now), message: `Created pipeline for ${deals.length} selected artists.` }]
  });
}

function dealFor(pipeline, artistId) {
  const deal = pipeline.deals.find(item => item.artistId === artistId);
  if (!deal) throw new Error('The artist is not part of this saved slate.');
  return deal;
}

export function applyPipelineEvent(source, raw, now = new Date().toISOString()) {
  const pipeline = structuredClone(source);
  if (!Number.isInteger(pipeline.revision)) pipeline.revision = 0;
  const event = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (pipeline.events.length >= 500) throw new Error('This pipeline reached its 500-event retention limit.');
  if (event.expectedRevision != null && Number(event.expectedRevision) !== pipeline.revision) throw new Error(`Pipeline revision conflict: expected ${event.expectedRevision}, current ${pipeline.revision}.`);
  const type = String(event.type || ''), deal = dealFor(pipeline, String(event.artistId || ''));
  deal.pitch ||= { angle: null, venueSegment: null, draft: null, approvedAt: null };
  deal.outreach ??= null;
  deal.negotiation ||= { counteroffers: [] };
  deal.negotiation.counteroffers ||= [];
  const at = iso(now), record = { id: `e${pipeline.events.length + 1}`, type, artistId: deal.artistId, at };
  if (type === 'approve_pitch') {
    if (deal.stage !== 'research_complete') throw new Error('A pitch can be approved only after research is complete.');
    deal.stage = 'pitch_approved';
    deal.pitch = { angle: label(event.pitchAngle), venueSegment: label(event.venueSegment),
      draft: String(event.draft || '').trim().slice(0, 4000) || null, approvedAt: at };
    record.pitchAngle = deal.pitch.angle; record.venueSegment = deal.pitch.venueSegment;
    record.message = `Pitch approved for ${deal.artistName}.`;
  } else if (type === 'send_outreach') {
    if (deal.stage !== 'pitch_approved') throw new Error('Outreach can be sent only after pitch approval.');
    deal.stage = 'sent'; deal.sentAt = at;
    deal.outreach = { channel: label(event.channel, 'email'), recipient: String(event.recipient || '').trim().slice(0, 254) || null,
      externalMessageId: String(event.externalMessageId || '').trim().slice(0, 180) || null, recordedAt: at };
    deal.followUps = [3, 7, 14].map(day => ({ day, dueAt: addDays(at, day), status: 'scheduled' }));
    record.message = `Outreach recorded for ${deal.artistName}; Day 3/7/14 follow-ups scheduled.`;
  } else if (type === 'record_response') {
    if (!['sent', 'responded', 'negotiating'].includes(deal.stage)) throw new Error('A response requires recorded outreach.');
    const responseType = String(event.responseType || '');
    if (!RESPONSE_TYPES.has(responseType)) throw new Error('Unknown response type.');
    const agreedRate = event.agreedRate == null ? null : Number(event.agreedRate);
    if (agreedRate != null && (!Number.isFinite(agreedRate) || agreedRate < 0 || agreedRate > 1e9)) throw new Error('Agreed rate must be a valid non-negative amount.');
    deal.response = {
      type: responseType, objection: responseType === 'objection' ? String(event.objection || 'unspecified').trim().slice(0, 120) : null,
      objectionCategory: responseType === 'objection' ? label(event.objectionCategory || event.objection, 'other') : null,
      note: String(event.note || '').trim().slice(0, 500), at
    };
    const counterofferRate = event.counterofferRate == null ? null : Number(event.counterofferRate);
    if (counterofferRate != null && (!Number.isFinite(counterofferRate) || counterofferRate < 0 || counterofferRate > 1e9)) throw new Error('Counteroffer rate must be a valid non-negative amount.');
    if (counterofferRate != null && !['negotiating', 'objection'].includes(responseType)) throw new Error('A counteroffer rate requires a negotiating or objection response.');
    if (counterofferRate != null) deal.negotiation.counteroffers.push({ direction: 'received', amount: money(counterofferRate), at, note: String(event.note || '').trim().slice(0, 500) });
    if (responseType !== 'no_response') for (const followUp of deal.followUps) if (followUp.status === 'scheduled') followUp.status = 'cancelled';
    if (responseType === 'accepted') {
      deal.stage = 'secured'; deal.agreedRate = agreedRate ?? deal.proposedRate;
      deal.checklist.rateConfirmed = Number.isFinite(deal.agreedRate);
    } else if (['negotiating', 'objection'].includes(responseType)) deal.stage = 'negotiating';
    else if (responseType === 'declined') deal.stage = 'declined';
    else if (responseType === 'information') deal.stage = 'responded';
    record.message = `Recorded ${responseType} response for ${deal.artistName}.`;
  } else if (type === 'record_counteroffer') {
    if (deal.stage !== 'negotiating') throw new Error('A counteroffer can be recorded only while negotiating.');
    const amount = Number(event.amount), direction = String(event.direction || '');
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) throw new Error('Counteroffer amount must be a valid non-negative amount.');
    if (!['received', 'proposed'].includes(direction)) throw new Error('Counteroffer direction must be received or proposed.');
    deal.negotiation.counteroffers.push({ direction, amount: money(amount), at, note: String(event.note || '').trim().slice(0, 500) });
    record.amount = money(amount); record.direction = direction;
    record.message = `Recorded a ${direction} counteroffer for ${deal.artistName}.`;
  } else if (type === 'complete_follow_up') {
    const day = Number(event.day), followUp = deal.followUps.find(item => item.day === day);
    if (!followUp || followUp.status !== 'scheduled') throw new Error('That follow-up is not scheduled.');
    followUp.status = 'completed'; followUp.completedAt = at; record.message = `Completed Day ${day} follow-up for ${deal.artistName}.`;
  } else if (type === 'update_logistics') {
    if (!['secured', 'logistics_pending', 'show_scheduled'].includes(deal.stage)) throw new Error('Logistics can be updated only for a secured deal.');
    const update = event.checklist && typeof event.checklist === 'object' && !Array.isArray(event.checklist) ? event.checklist : {};
    for (const key of CHECKLIST_KEYS) if (Object.hasOwn(update, key)) deal.checklist[key] = update[key] === true;
    const core = ['dateConfirmed', 'rateConfirmed', 'contactConfirmed'].every(key => deal.checklist[key]);
    const scheduled = ['dateConfirmed', 'rateConfirmed', 'contactConfirmed', 'setLengthConfirmed', 'loadInConfirmed', 'paymentConfirmed'].every(key => deal.checklist[key]);
    deal.stage = scheduled ? 'show_scheduled' : core ? 'logistics_pending' : 'secured';
    record.message = `Updated logistics for ${deal.artistName}; stage is ${deal.stage}.`;
  } else if (type === 'add_note') {
    const note = String(event.note || '').trim().slice(0, 500);
    if (!note) throw new Error('A non-empty note is required.');
    deal.notes.push({ text: note, at }); record.message = `Added a note for ${deal.artistName}.`;
  } else throw new Error('Unknown pipeline event type.');
  deal.updatedAt = at; pipeline.updatedAt = at; pipeline.revision += 1; pipeline.events.push(record);
  return refresh(pipeline);
}
