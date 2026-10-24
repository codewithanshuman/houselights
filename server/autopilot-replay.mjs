import { loadJudgeCase } from './judge.mjs';
import { runAutopilot } from './autopilot.mjs';
import { publicAutopilotReceipt, judgeAutopilotSource } from './autopilot-api.mjs';

const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);

// Re-executes the deterministic policy against the recorded observations. The
// replay makes no provider calls and invents no answer for an unrecorded query.
export async function replayRecordedAutopilot(file) {
  const record = loadJudgeCase(file.caseId);
  if (!record) return { passed: false, reason: 'The recorded case is not published on this server.' };
  const recorded = file.run.receipts, calls = [];
  let index = 0;
  const research = {
    used: () => recorded.slice(0, index).reduce((sum, row) => sum + (row.attempts ?? 1), 0),
    call: async (tool, args) => {
      const expected = recorded[index];
      const projected = publicAutopilotReceipt({ tool, args, evidence: {} }).args;
      const match = expected && expected.tool === tool && stable(expected.args) === stable(projected);
      calls.push({ index, tool, matched: !!match });
      if (!match) throw Object.assign(new Error(`Replay diverged at call ${index + 1}: the policy requested ${tool} with different arguments.`), { divergence: true });
      index++;
      return { receipt: expected };
    },
  };
  try {
    const result = await runAutopilot(judgeAutopilotSource(record), { maxCalls: file.run.budget.maxCalls, maxRounds: file.run.budget.maxRounds }, { research, now: () => file.clockStart, mode: 'replay' });
    const checks = [
      ['same number of research calls', index === recorded.length],
      ['same decision history', stable(result.history.map(({ phase, selectedIds, cause }) => ({ phase, selectedIds, cause }))) === stable(file.run.history.map(({ phase, selectedIds, cause }) => ({ phase, selectedIds, cause })))],
      ['same recommendation', stable(result.packet.recommendation?.selectedIds ?? []) === stable(file.run.packet.recommendation?.selectedIds ?? [])],
      ['same strategies', stable(result.strategies.list.map(row => [row.id, row.selectedIds])) === stable(file.run.strategies.list.map(row => [row.id, row.selectedIds]))],
      ['same stop reasons', stable(result.stop) === stable(file.run.stop)],
      ['same run digest', result.digest === file.run.digest],
    ].map(([name, passed]) => ({ name, passed }));
    return { passed: checks.every(row => row.passed), providerCalls: 0, replayedCalls: index, checks, digest: result.digest, recordedDigest: file.run.digest };
  } catch (error) {
    if (!error.divergence) throw error;
    return { passed: false, providerCalls: 0, replayedCalls: index, reason: error.message, calls };
  }
}
