export function wilsonInterval(wins, trials, z = 1.96) {
  if (!Number.isInteger(wins) || !Number.isInteger(trials) || wins < 0 || wins > trials) throw new Error('Invalid binary counts.');
  if (!trials) return null;
  const p = wins / trials, z2 = z * z, center = (p + z2 / (2 * trials)) / (1 + z2 / trials);
  const half = z / (1 + z2 / trials) * Math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials));
  return { low: Math.max(0, center - half), high: Math.min(1, center + half), trials, method: 'Wilson 95% interval' };
}

export function reviewStatistics(report) {
  if (!report) return { status: 'unavailable', completedReviewers: 0, submittedJudgments: 0,
    rows: [], reason: 'No independent blinded review study is linked to this experiment.' };
  const totals = (report.cases ?? []).reduce((sum, row) => {
    for (const key of ['qloo', 'control', 'tie', 'abstain']) sum[key] += row[key] ?? 0;
    return sum;
  }, { qloo: 0, control: 0, tie: 0, abstain: 0 });
  const decisive = totals.qloo + totals.control;
  return { status: totals.qloo + totals.control + totals.tie + totals.abstain ? 'observed' : 'pending',
    invitedReviewers: report.invitedReviewers ?? 0, completedReviewers: report.completedReviewers ?? 0,
    distinctBriefs: report.distinctBriefs ?? 0,
    submittedJudgments: Object.values(totals).reduce((a, b) => a + b, 0), totals,
    preferenceRate: decisive ? totals.qloo / decisive : null, decisiveDenominator: decisive,
    interval: wilsonInterval(totals.qloo, decisive),
    rows: (report.cases ?? []).map(row => ({ caseId: row.caseId, sourceId: row.sourceId,
      city: row.city, synthetic: row.synthetic, identical: row.identical,
      qloo: row.qloo, control: row.control, tie: row.tie, abstain: row.abstain,
      reasons: row.reasons })),
    limitation: 'Reviewers can judge multiple briefs and repeated votes are clustered within reviewer and brief. The interval is descriptive only.' };
}

export function summarizeExperiments(reports) {
  const cases = reports.map(report => ({ sourceId: report.config.sourceSnapshotId, city: report.brief.city,
    genre: report.brief.genre, eventSize: report.brief.eventSize, slots: report.brief.slots, currency: report.brief.currency,
    synthetic: report.brief.synthetic, poolDigest: report.poolDigest, candidateCount: report.config.candidateIds.length,
    briefDigest: report.briefDigest, llmStatus: report.methods.llm_only.status,
    llmLineup: report.methods.llm_only.selectedIds, fullFeasible: report.methods.full_houselights.feasible,
    feeDifference: report.methods.llm_only.available ? report.methods.full_houselights.totalFee - report.methods.llm_only.totalFee : null }));
  const pools = new Set(cases.map(row => row.poolDigest));
  const llmAttempts = cases.filter(row => !['unavailable', 'stale', 'not_comparable'].includes(row.llmStatus));
  const llmFailures = llmAttempts.filter(row => row.llmStatus !== 'feasible');
  const pairedFeeCases = cases.filter(row => row.llmStatus === 'feasible' && Number.isFinite(row.feeDifference));
  const pairedFees = Object.fromEntries([...new Set(pairedFeeCases.map(row => row.currency))].map(currency => {
    const values = pairedFeeCases.filter(row => row.currency === currency).map(row => row.feeDifference).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return [currency, { count: values.length, medianDifference: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
      differences: values }];
  }));
  const strata = field => Object.fromEntries([...new Set(cases.map(row => row[field] ?? 'unknown'))].map(value => [String(value), {
    records: cases.filter(row => (row[field] ?? 'unknown') === value).length,
    distinctBriefs: new Set(cases.filter(row => (row[field] ?? 'unknown') === value).map(row => row.briefDigest)).size,
  }]));
  const repeatedBriefs = [...new Set(cases.map(row => row.briefDigest))].map(briefDigest => {
    const rows = cases.filter(row => row.briefDigest === briefDigest);
    const attempts = rows.filter(row => !['unavailable', 'stale', 'not_comparable'].includes(row.llmStatus));
    return { briefDigest, records: rows.length, attempts: attempts.length,
      failures: attempts.filter(row => row.llmStatus !== 'feasible').length,
      distinctLineups: new Set(attempts.filter(row => row.llmStatus === 'feasible').map(row => [...row.llmLineup].sort().join('|'))).size };
  });
  return { cases, repeatedBriefs, pairedBookingCost: { byCurrency: pairedFees,
    unit: 'Full HouseLights quoted fees minus saved LLM quoted fees; comparisons stay within each currency.' },
    strata: { city: strata('city'), genre: strata('genre'), eventSize: strata('eventSize'), slots: strata('slots') },
    coverage: { publishedRecords: cases.length, briefs: new Set(cases.map(row => row.briefDigest)).size,
    cities: new Set(cases.map(row => row.city)).size,
    distinctPools: pools.size, syntheticBriefs: cases.filter(row => row.synthetic).length,
    meetsTwelveDistinctBriefTarget: new Set(cases.map(row => row.briefDigest)).size >= 12 && pools.size >= 12 },
    llmFailureRate: { failures: llmFailures.length, attempted: llmAttempts.length,
      value: llmAttempts.length ? llmFailures.length / llmAttempts.length : null,
      interval: wilsonInterval(llmFailures.length, llmAttempts.length) },
    limitation: 'The event brief is the unit; repeated model attempts must not be counted as independent markets. The LLM failure fraction counts available saved attempts, and repeatedBriefs exposes clustering. Operational outcomes do not prove audience preference.' };
}
