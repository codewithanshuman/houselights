import { loadJudgeCase } from './judge.mjs';
import { runAutopilot } from './autopilot.mjs';
import { judgeAutopilotSource } from './autopilot-api.mjs';
import { publicReceipt, canonical, verifyEvidenceContent } from './autopilot-integrity.mjs';

const PROVENANCE = { verified: false,
  statement: 'Provider authenticity is not independently verifiable: Qloo responses are unsigned. The record shows which tool, arguments and capture time the application recorded; originalDigest values are application hashes made at capture, not provider signatures.' };

// Re-executes the deterministic policy against the recorded observations. The
// replay makes no provider calls and invents no answer for an unrecorded query.
export async function replayRecordedAutopilot(file) {
  const record = loadJudgeCase(file.caseId);
  if (!record) return { passed: false, reason: 'The recorded case is not published on this server.' };
  const legacy = file.run.version === '1.0';
  const recorded = file.run.receipts, calls = [];
  let index = 0;
  const research = {
    used: () => recorded.slice(0, index).reduce((sum, row) => sum + (row.attempts ?? 1), 0),
    call: async (tool, args) => {
      const expected = recorded[index];
      const match = expected && expected.tool === tool && canonical(expected.args) === canonical(publicReceipt({ tool, args, evidence: {} }).args);
      calls.push({ index, tool, matched: !!match });
      if (!match) throw Object.assign(new Error(`Replay diverged at call ${index + 1}: the policy requested ${tool} with different arguments.`), { divergence: true });
      index++;
      return { receipt: expected };
    },
  };
  try {
    const result = await runAutopilot(judgeAutopilotSource(record), { maxCalls: file.run.budget.maxCalls, maxRounds: file.run.budget.maxRounds },
      { research, now: () => file.clockStart, mode: 'replay', policy: legacy ? 'value-v1' : file.run.policy ?? 'value',
        // Records made before affinity fits carry no fitBasis and replay on ordinal ranks.
        // Scale versions: no fitBasis → ordinal; fitBasis without fitScale → min-max.
        fitBasis: !file.run.fitBasis ? 'ordinal' : file.run.fitScale ? 'affinity' : 'affinity-minmax' });
    // 2.0 labels rank and cross-check results with their question; 1.0 did not.
    const observed = run => run.observations.map(({ questionId, receiptId, results }) => ({ questionId, receiptId, results: results.map(({ state, text, questionId: id }) => ({ state, text, ...(legacy || ['rank', 'crosscheck'].includes(id) ? {} : { questionId: id }) })) }));
    const pick = run => run.history.map(({ phase, selectedIds, cause }) => ({ phase, selectedIds, cause }));
    const checks = [
      ['same number of research calls', index === recorded.length],
      ['same research actions', canonical(result.events.filter(row => row.type === 'action').map(row => row.questionId)) === canonical(file.run.events.filter(row => row.type === 'action').map(row => row.questionId))],
      ['same decision history', canonical(pick(result)) === canonical(pick(file.run))],
      ['same observations', canonical(observed(result)) === canonical(observed(file.run))],
      // 1.0 records predate the 2.0 strategy engine and digest; they are checked
      // for research reproducibility only, under the 1.0 research policy.
      ...(legacy ? [] : [
        ['same recommendation', canonical(result.packet.recommendation?.selectedIds ?? []) === canonical(file.run.packet.recommendation?.selectedIds ?? [])],
        ['same strategies', canonical(result.strategies.list.map(row => [row.id, row.selectedIds])) === canonical(file.run.strategies.list.map(row => [row.id, row.selectedIds]))],
        ['same stop reasons', canonical(result.stop) === canonical(file.run.stop)],
        ['same decision digest', result.digest === file.run.digest],
      ]),
    ].map(([name, passed]) => ({ name, passed }));
    return { passed: checks.every(row => row.passed), providerCalls: 0, replayedCalls: index, policy: legacy ? 'value-v1' : file.run.policy, scope: legacy ? 'research reproducibility (1.0 record)' : 'full decision reproducibility', checks, digest: result.digest, recordedDigest: file.run.digest };
  } catch (error) {
    if (!error.divergence) throw error;
    return { passed: false, providerCalls: 0, replayedCalls: index, reason: error.message, calls };
  }
}

/** The three separately reported properties of a recorded run. */
export async function verifyRecordedAutopilot(file, { pinnedManifestDigest = null } = {}) {
  const record = loadJudgeCase(file.caseId);
  const evidenceContent = verifyEvidenceContent(file.run, { sourceReceipts: record?.snapshot.receipts ?? [], pinnedManifestDigest });
  const decisionReproducibility = await replayRecordedAutopilot(file);
  return { passed: evidenceContent.passed && decisionReproducibility.passed, evidenceContent, decisionReproducibility, providerProvenance: PROVENANCE };
}
