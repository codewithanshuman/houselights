import test from 'node:test';
import assert from 'node:assert/strict';
process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
const { readRequest, validSteps, interpretAsk } = await import('../server/agent-ask.mjs');

const acts = [{ id: 'k', name: 'Michael Kiwanuka' }, { id: 's', name: 'Sault' }, { id: 'j', name: 'Jordan Rakei' }];
const plan = { acts, billIds: ['k', 's'], budget: 20000 };
const read = request => validSteps(readRequest(request, plan), plan);
const noModel = async () => { throw new Error('model must not be asked'); };

test('budget requests are read in percent, amount and local words', () => {
  assert.deepEqual(read('Cut the budget by 20%'), [{ type: 'budget', budget: 16000 }]);
  assert.deepEqual(read('raise the budget 10 percent'), [{ type: 'budget', budget: 22000 }]);
  assert.deepEqual(read('set budget to 15,000'), [{ type: 'budget', budget: 15000 }]);
  assert.deepEqual(read('budget of 30k please'), [{ type: 'budget', budget: 30000 }]);
  assert.deepEqual(read('make the budget 15 lakh'), [{ type: 'budget', budget: 1500000 }]);
  assert.deepEqual(read('we only have 12000'), [{ type: 'budget', budget: 12000 }]);
});

test('a named act is dropped, and a replacement is searched only when asked', () => {
  assert.deepEqual(read('Drop Sault'), [{ type: 'drop', id: 's' }]);
  assert.deepEqual(read('sault cant play, find someone else'), [{ type: 'drop', id: 's' }, { type: 'replan' }]);
  assert.deepEqual(read('Replace Michael Kiwanuka'), [{ type: 'drop', id: 'k' }, { type: 'replan' }]);
  assert.deepEqual(read('cut the budget by 20% and drop Sault'), [{ type: 'budget', budget: 16000 }, { type: 'drop', id: 's' }]);
  assert.deepEqual(read('Drop Jordan Rakei'), [], 'an act not on the bill cannot be dropped');
  assert.deepEqual(read('tell me about Sault'), []);
});

test('the other actions are recognised', () => {
  assert.deepEqual(read('reset'), [{ type: 'reset' }]);
  assert.deepEqual(read('Where should we play?'), [{ type: 'crowd' }]);
  assert.deepEqual(read('who are the sponsors'), [{ type: 'crowd' }]);
  assert.deepEqual(read('would this make money'), [{ type: 'finance' }]);
});

test('rules answer without the model, and the model is only asked otherwise', async () => {
  assert.deepEqual(await interpretAsk('Drop Sault', plan, { ask: noModel }), { steps: [{ type: 'drop', id: 's' }], by: 'rules' });
  let asked = 0;
  const result = await interpretAsk('make it feel more soulful and intimate', plan, { ask: async () => { asked++; return { steps: [{ type: 'drop', id: 'k' }] }; } });
  assert.equal(asked, 1);
  assert.deepEqual(result.steps, [{ type: 'drop', id: 'k' }]);
});

test('the model can only choose valid steps, and an outage is a plain no', async () => {
  const propose = steps => interpretAsk('do something unusual', plan, { ask: async () => ({ steps }) });
  assert.deepEqual((await propose([{ type: 'drop', id: 'not-on-bill' }])).steps, []);
  assert.deepEqual((await propose([{ type: 'book', id: 's' }, { type: 'budget', budget: -5 }, { type: 'budget', budget: 'lots' }])).steps, []);
  assert.deepEqual((await propose([{ type: 'replan' }])).steps, [], 'a replacement needs a dropped act');
  assert.equal((await propose([1, 2, 3, 4, { type: 'crowd' }])).steps.length, 0, 'at most three steps are read');
  assert.deepEqual((await interpretAsk('do something unusual', plan, { ask: async () => { throw new Error('down'); } })).steps, []);
  assert.deepEqual((await interpretAsk('do something unusual', plan, { ask: async () => 'nonsense' })).steps, []);
});

test('an empty or oversized request is refused', async () => {
  await assert.rejects(interpretAsk('  ', plan, { ask: noModel }), /up to 300/);
  await assert.rejects(interpretAsk('x'.repeat(301), plan, { ask: noModel }), /up to 300/);
  await assert.rejects(interpretAsk({ a: 1 }, plan, { ask: noModel }), /up to 300/);
});
