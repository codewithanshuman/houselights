// Evidence integrity for Autopilot records.
//
// Three separate properties are reported and never conflated:
// 1. Evidence-content integrity: every public receipt still hashes to the digest
//    in the record's manifest, and the manifest hashes to its own digest. This
//    detects edits to affinity, entities, status, arguments or provenance fields.
//    An editor who rewrites the content AND recomputes every digest is detected
//    only against an independently pinned manifest digest (release check, git).
// 2. Decision reproducibility: re-running the deterministic policy on the
//    recorded observations yields the same actions, decisions and digest.
// 3. Provider provenance: NOT cryptographically verifiable. Qloo responses are
//    not signed; `originalDigest` is an application hash made at capture time.
import { createHash } from 'node:crypto';

export const INTEGRITY_VERSION = '2.0';
export const CANONICALIZATION = 'houselights-canonical-json/1: UTF-8 JSON, object keys sorted by code point, arrays in order, no whitespace, finite numbers only';

export function canonical(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Canonical JSON rejects non-finite numbers.');
    if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]]));
    return item;
  });
}
export const sha256 = value => 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex');

const text = (value, max = 200) => typeof value === 'string' ? value.slice(0, max) : undefined;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 20).map(item => item.slice(0, 180)) : undefined;

// Public receipts keep the fields the research policy reads and the query scope
// needed to audit it. Coordinates, tags and raw provider payloads are omitted.
export function publicReceipt(receipt) {
  const evidence = receipt.evidence ?? {};
  const args = Object.fromEntries(['entity', 'entity_type', 'within', 'group_a', 'group_b', 'target_type', 'entities', 'options', 'option_type', 'signals', 'signal_location', 'start_date', 'end_date', 'limit']
    .filter(name => receipt.args?.[name] !== undefined).map(name => [name, Array.isArray(receipt.args[name]) ? strings(receipt.args[name]) : typeof receipt.args[name] === 'number' ? receipt.args[name] : text(receipt.args[name])]));
  return { id: text(receipt.id, 20), tool: text(receipt.tool, 40), args, why: text(receipt.why), status: text(receipt.status, 20), source: receipt.source === 'qloo' ? 'qloo' : 'synthetic',
    cached: receipt.cached === true, attempts: finite(receipt.attempts) ?? null, ms: finite(receipt.ms) ?? null, fetchedAt: text(receipt.fetchedAt, 40), originalDigest: /^sha256:[a-f0-9]{64}$/.test(receipt.digest ?? receipt.originalDigest ?? '') ? (receipt.digest ?? receipt.originalDigest) : null,
    evidence: { kind: text(evidence.kind, 40), total: finite(evidence.total) ?? null,
      rows: (Array.isArray(evidence.rows) ? evidence.rows : []).slice(0, 50).map(row => Object.fromEntries(Object.entries({ id: text(row.id, 180), name: text(row.name, 180), affinity: finite(row.affinity), popularity: finite(row.popularity), change: finite(row.change), direction: text(row.direction, 20) }).filter(([, value]) => value !== undefined))),
      ...(evidence.kind === 'compare_audiences' ? { comparisonAvailable: evidence.comparisonAvailable === true, interpretable: evidence.interpretable === true, sharedNames: strings(evidence.sharedNames) ?? [] } : {}),
      ...(evidence.error ? { error: text(evidence.error, 40) } : {}) } };
}

// Timing fields (ms) describe the capture, not the evidence; everything else is covered.
export function receiptContentDigest(receipt) {
  const { ms: _ms, ...content } = publicReceipt(receipt);
  return sha256(content);
}

// Source receipts come from the published case projection. Hash them as stored.
export const sourceReceiptDigest = receipt => sha256(receipt);

export function buildManifest({ receipts = [], sourceReceipts = [], decisionDigest, items = [] }) {
  const manifest = { version: INTEGRITY_VERSION, algorithm: 'sha256', canonicalization: CANONICALIZATION,
    receipts: receipts.map(receipt => ({ id: receipt.id, contentDigest: receiptContentDigest(receipt), originalDigest: publicReceipt(receipt).originalDigest })),
    sourceReceipts: sourceReceipts.map(receipt => ({ id: receipt.id, contentDigest: sourceReceiptDigest(receipt) })),
    decisionInputsDigest: sha256(items.map(({ id, fit, rank, of, local, momentum, evidence, evidenceReceipts, terms }) => ({ id, fit, rank, of, local, momentum, evidence, evidenceReceipts, terms }))),
    decisionDigest,
    providerProvenance: 'Not cryptographically verifiable: Qloo responses are unsigned. originalDigest values are application hashes computed when each response was received.' };
  return { ...manifest, manifestDigest: sha256(manifest) };
}

/**
 * Checks evidence-content integrity of a record against its own manifest and,
 * optionally, against an independently pinned manifest digest.
 */
export function verifyEvidenceContent(run, { sourceReceipts = [], pinnedManifestDigest = null } = {}) {
  const manifest = run.integrity, problems = [];
  if (!manifest || manifest.version !== INTEGRITY_VERSION) return { passed: false, problems: ['No version 2.0 integrity manifest is present.'] };
  const { manifestDigest, ...body } = manifest;
  if (sha256(body) !== manifestDigest) problems.push('The manifest no longer matches its own digest.');
  if (pinnedManifestDigest && manifestDigest !== pinnedManifestDigest) problems.push('The manifest digest differs from the independently pinned digest.');
  const listed = new Map(manifest.receipts.map(row => [row.id, row]));
  if (listed.size !== run.receipts.length) problems.push('The number of receipts differs from the manifest.');
  for (const receipt of run.receipts) {
    const row = listed.get(receipt.id);
    if (!row) { problems.push(`Receipt ${receipt.id} is not in the manifest.`); continue; }
    if (receiptContentDigest(receipt) !== row.contentDigest) problems.push(`Receipt ${receipt.id} content differs from its manifest digest.`);
    if ((publicReceipt(receipt).originalDigest ?? null) !== (row.originalDigest ?? null)) problems.push(`Receipt ${receipt.id} capture-time digest differs from the manifest.`);
  }
  const sources = new Map(manifest.sourceReceipts.map(row => [row.id, row.contentDigest]));
  for (const receipt of sourceReceipts) if (sources.has(receipt.id) && sources.get(receipt.id) !== sourceReceiptDigest(receipt)) problems.push(`Source receipt ${receipt.id} differs from the manifest.`);
  if (manifest.decisionInputsDigest !== sha256((run.items ?? []).map(({ id, fit, rank, of, local, momentum, evidence, evidenceReceipts, terms }) => ({ id, fit, rank, of, local, momentum, evidence, evidenceReceipts, terms }))))
    problems.push('The decision inputs (fits, evidence flags, terms) differ from the manifest.');
  if (manifest.decisionDigest !== run.digest) problems.push('The run decision digest differs from the manifest.');
  return { passed: problems.length === 0, problems, manifestDigest };
}
