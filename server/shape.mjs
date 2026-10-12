// Adapters verified against @qloo/qloo-harness 0.1.26. Unfamiliar payloads
// stay inspectable, but never become invented audience percentages.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim() ? value : undefined;
const finite = value => typeof value === 'number' && Number.isFinite(value);
export const nameOf = r => typeof r === 'string' ? r : text(r?.name) ?? text(r?.title) ?? text(r?.entity?.name) ?? text(r?.label);
export const idOf = r => record(r) ? text(r.entity_id) ?? text(r.entityId) ?? text(r.id) ?? text(r.entity?.entity_id) ?? text(r.entity?.entityId) ?? text(r.entity?.id) : undefined;
export const tagsOf = env => (Array.isArray(env?.results) ? env.results : []).map(nameOf).filter(Boolean);

export const failure = (code, summary, retryable = false) => ({
  status: 'error', summary, results: [], result_count: 0, error: { code, retryable },
});

export function normalizeEnvelope(raw, tool) {
  if (!record(raw) || !['ok', 'empty', 'needs_input', 'partial', 'degraded', 'error'].includes(raw.status)) {
    return failure('INVALID_RESPONSE', 'The Qloo harness returned an unrecognized result envelope.');
  }
  let results = Array.isArray(raw.results) ? raw.results : [];
  if (raw.status === 'needs_input' && !results.length) {
    const issues = Array.isArray(raw.resolution?.issues) ? raw.resolution.issues : [];
    results = issues.flatMap(issue => Array.isArray(issue.candidates) ? issue.candidates : []);
  } else if (tool === 'trends' && Array.isArray(raw.series)) {
    results = raw.series;
  }
  return {
    ...raw,
    ...(record(raw.results) && tool === 'compare_audiences' ? { comparison: raw.results } : {}),
    results,
    result_count: results.length,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    ...(raw.status === 'error' ? { error: {
      code: typeof raw.error?.code === 'string' ? raw.error.code : 'QLOO_ERROR',
      retryable: raw.error?.retryable === true,
      ...(typeof raw.error?.recovery === 'string' ? { recovery: raw.error.recovery } : {}),
    } } : {}),
  };
}

export function trendOf(input, ref, name) {
  const low = value => String(value || '').toLowerCase();
  const row = ref === undefined ? input : (input?.results || input?.series || []).find(item =>
    low(idOf(item)) === low(ref) || (name && low(nameOf(item)) === low(name)));
  // Provider-specific points are passed through unchanged by the harness.
  // Do not treat affinity, point order, or arbitrary numbers as growth rates.
  const change = row?.change;
  if (finite(change)) return {
    direction: change > 0 ? 'rising' : change < 0 ? 'cooling' : 'flat',
    change, basis: 'Explicit source change; not an attendance forecast.',
  };
  return { direction: 'unknown', change: null, basis: Array.isArray(row?.points) && row.points.length
    ? 'Time-series points returned; direction awaits calibration against a live Qloo fixture.'
    : 'No interpretable trend measurement returned.' };
}

export function comparisonOf(env) {
  const rows = Array.isArray(env?.results) ? env.results : [];
  const available = ['ok', 'partial', 'degraded'].includes(env?.status)
    && (rows.length > 0 || (record(env?.comparison) && Object.keys(env.comparison).length > 0));
  return { available, count: rows.length, summary: available
    ? 'Aggregate audience comparison returned. It does not measure unique or net-new ticket buyers.'
    : 'No usable audience comparison returned.' };
}

// Only public entity labels and documented scalar evidence enter the ledger.
export function compactEvidence(tool, env) {
  const rows = env.results.slice(0, 12).map(row => {
    const out = {};
    const name = nameOf(row), id = idOf(row);
    if (name) out.name = name.slice(0, 180);
    if (id) out.id = id.slice(0, 180);
    for (const key of ['affinity', 'popularity', 'change']) if (finite(row?.[key])) out[key] = row[key];
    if (finite(row?.query?.affinity)) out.affinity = row.query.affinity;
    if (Array.isArray(row?.points)) {
      out.pointCount = row.points.length;
      out.direction = trendOf(row).direction;
    }
    return out;
  });
  return {
    kind: tool, rows, total: env.result_count,
    ...(tool === 'compare_audiences' ? { interpretation: comparisonOf(env).summary,
      comparisonAvailable: comparisonOf(env).available,
      ...(record(env.comparison) ? { returnedFields: Object.keys(env.comparison).slice(0, 20) } : {}),
      ...(Array.isArray(env.comparison?.shared) ? { sharedNames: env.comparison.shared.map(nameOf).filter(Boolean).slice(0, 12) } : {}),
    } : {}),
    ...(env.error ? { error: env.error.code } : {}),
  };
}
