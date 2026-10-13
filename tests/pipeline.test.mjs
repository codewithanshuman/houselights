import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipeline, applyPipelineEvent } from '../server/pipeline.mjs';

const snapshot = {
  id: 'source1234', memo: {
    slate: { feasible: true, selectedIds: ['a'] },
    items: [{ id: 'a', name: 'Alpha', terms: { fee: 1200, available: true } }]
  }
};
const at = '2026-10-12T10:00:00.000Z';

test('pipeline runs research, approval, outreach, response and logistics as guarded stages', () => {
  let pipeline = createPipeline(snapshot, at);
  assert.equal(pipeline.deals[0].stage, 'research_complete');
  pipeline = applyPipelineEvent(pipeline, { type: 'approve_pitch', artistId: 'a' }, at);
  assert.equal(pipeline.revision, 1);
  pipeline = applyPipelineEvent(pipeline, { type: 'send_outreach', artistId: 'a' }, at);
  assert.deepEqual(pipeline.deals[0].followUps.map(item => item.day), [3, 7, 14]);
  assert.match(pipeline.deals[0].followUps[0].dueAt, /^2026-10-15/);
  pipeline = applyPipelineEvent(pipeline, { type: 'record_response', artistId: 'a', responseType: 'accepted', agreedRate: 1100 }, at);
  assert.equal(pipeline.deals[0].stage, 'secured');
  assert.ok(pipeline.deals[0].followUps.every(item => item.status === 'cancelled'));
  pipeline = applyPipelineEvent(pipeline, { type: 'update_logistics', artistId: 'a', checklist: { dateConfirmed: true, contactConfirmed: true, setLengthConfirmed: true, loadInConfirmed: true, paymentConfirmed: true } }, at);
  assert.equal(pipeline.deals[0].stage, 'show_scheduled');
  assert.equal(pipeline.analytics.accepted, 1);
  assert.equal(pipeline.analytics.totalCommittedFee, 1100);
});

test('invalid transitions fail without mutating the original pipeline', () => {
  const pipeline = createPipeline(snapshot, at), original = structuredClone(pipeline);
  assert.throws(() => applyPipelineEvent(pipeline, { type: 'send_outreach', artistId: 'a' }, at), /approval/);
  assert.throws(() => applyPipelineEvent(pipeline, { type: 'approve_pitch', artistId: 'unknown' }, at), /not part/);
  assert.throws(() => applyPipelineEvent(pipeline, { type: 'approve_pitch', artistId: 'a', expectedRevision: 4 }, at), /revision conflict/);
  assert.deepEqual(pipeline, original);
});

test('objections feed deterministic pipeline analytics', () => {
  let pipeline = createPipeline(snapshot, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'approve_pitch', artistId: 'a' }, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'send_outreach', artistId: 'a' }, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'record_response', artistId: 'a', responseType: 'objection', objection: 'fee' }, at);
  assert.equal(pipeline.analytics.objections.fee, 1);
  assert.ok(pipeline.feedback.some(item => item.includes('fee')));
});

test('pipeline retains pitch segmentation and a complete counteroffer history', () => {
  let pipeline = createPipeline(snapshot, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'approve_pitch', artistId: 'a', pitchAngle: 'local audience fit', venueSegment: 'independent club', draft: 'Evidence-bound draft.' }, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'send_outreach', artistId: 'a', channel: 'email', recipient: 'agent@example.test' }, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'record_response', artistId: 'a', responseType: 'objection', objectionCategory: 'fee', objection: 'Fee too low', counterofferRate: 1600 }, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'record_counteroffer', artistId: 'a', direction: 'proposed', amount: 1400 }, at);
  assert.equal(pipeline.deals[0].pitch.angle, 'local audience fit');
  assert.equal(pipeline.deals[0].outreach.channel, 'email');
  assert.deepEqual(pipeline.deals[0].negotiation.counteroffers.map(row => [row.direction, row.amount]), [['received', 1600], ['proposed', 1400]]);
  assert.equal(pipeline.analytics.byPitchAngle[0].value, 'local audience fit');
  assert.equal(pipeline.analytics.byVenueSegment[0].responses, 1);
  assert.equal(pipeline.analytics.objections.fee, 1);
});

test('legacy persisted deals acquire negotiation fields on the next valid event', () => {
  let pipeline = createPipeline(snapshot, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'approve_pitch', artistId: 'a' }, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'send_outreach', artistId: 'a' }, at);
  delete pipeline.deals[0].pitch;
  delete pipeline.deals[0].outreach;
  delete pipeline.deals[0].negotiation;
  pipeline = applyPipelineEvent(pipeline, { type: 'record_response', artistId: 'a', responseType: 'negotiating', counterofferRate: 1500 }, at);
  assert.equal(pipeline.deals[0].negotiation.counteroffers[0].amount, 1500);
});
