// Decision packet renderers. Input is the structured packet built by Autopilot;
// both renderers only format it, so the exports cannot drift from the decision state.
const lines = values => values.filter(value => value != null).join('\n');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cell = value => String(value ?? '—').replace(/\|/g, '/').replace(/\n/g, ' ');

export const FEE_STATUS = { quoted: 'Quoted by agent (promoter-entered)', estimate: 'Promoter estimate', illustrative: 'Illustrative demo value', unknown: 'Unknown — quote needed' };
export const AVAILABILITY = { confirmed: 'Confirmed (promoter-entered)', assumed: 'Assumed for planning — confirm', unconfirmed: 'Not confirmed', unavailable: 'Unavailable', illustrative: 'Illustrative demo value' };
const MODE = { live: 'Fresh research with live Qloo calls', synthetic: 'SYNTHETIC Qloo fixtures — not real evidence', planning: 'Planning from saved evidence — no new Qloo calls', recorded: 'Recorded run replayed — no new Qloo calls', replay: 'Offline replay of recorded observations' };

// The wording follows the scoring version that produced the packet: fixed-span
// affinity (fitScale present), the earlier min-max affinity, or ordinal ranks.
const fitBasisText = packet => packet.fitBasis === 'qloo-affinity'
  ? (packet.fitScale ? `Qloo affinity scores, scaled over a fixed ${packet.fitScale.replace('fixed-span-', '')} span so small gaps stay small` : 'Qloo affinity scores, min-max scaled across the ranked pool (scoring used before 24 October 2026)')
  : 'ordinal rank positions (Qloo affinity scores unavailable)';
// Near-tie and comparability statements shared by both renderers.
function tieLines(packet) {
  const lines = [];
  if (packet.comparability && !packet.comparability.comparable) lines.push(`Not comparable: ${packet.comparability.reason}`);
  if (packet.ordinalComparison) lines.push(`Affinity versus ordinal: ${packet.ordinalComparison.text}`);
  for (const group of packet.ties?.groups ?? []) lines.push(group.changesBill
    ? `Near-tie that decides the bill: ${group.names.join(', ')} differ by ${group.spread.toFixed(4)} in Qloo affinity (band ${packet.ties.band}). Treated as tied, the bill would be ${group.tiedNames.join(' + ')}.`
    : `Near-tie with no effect on the bill: ${group.names.join(', ')} differ by ${group.spread.toFixed(4)} in Qloo affinity (band ${packet.ties.band}).`);
  return lines;
}

export function packetMarkdown(packet, money) {
  const rec = packet.recommendation, brief = packet.brief;
  return lines([
    `# ${brief.name ? `${brief.name} — ` : ''}Houselights decision packet`,
    `${MODE[packet.mode] ?? packet.mode}. Generated ${packet.generatedAt}. Decision support only: nothing has been booked, offered or approved.`,
    '', '## 1. Event brief',
    `- Market: ${brief.city}${brief.venue ? ` · Venue: ${brief.venue}` : ''}${brief.date ? ` · Date: ${brief.date}` : ''}`,
    brief.direction ? `- Programming direction (context only): ${brief.direction}` : null,
    brief.audience ? `- Target audience (context only; Qloo uses the reference artists): ${brief.audience}` : null,
    `- Audience reference artists (Qloo anchors): ${brief.anchors.join(', ') || '—'}`,
    ...(brief.objectives?.length ? [`- Objectives (context only, not used in the calculation): ${brief.objectives.join('; ')}`] : []),
    `- ${brief.slots} slots · ${money(brief.budget)} artist budget · max ${brief.maxPerGenre} per genre · ${brief.candidates} candidates${brief.locked?.length ? ` · locked: ${brief.locked.join(', ')}` : ''}${brief.excluded?.length ? ` · excluded: ${brief.excluded.join(', ')}` : ''}${brief.briefChanged ? ' · constraints changed from the saved brief' : ''}`,
    '', '## 2. Recommendation (for human approval)',
    rec ? `**${rec.names.join(' + ')}** — ${money(rec.totalFee)} planned artist fees, ${money(rec.headroom)} unallocated, ${rec.policyScore} policy points.` : `No feasible lineup. ${packet.infeasibility.reasons.join(' ')}`,
    rec?.provisional ? `**Provisional:** ${rec.provisionalReason}` : null,
    rec?.why ? rec.why : null,
    ...tieLines(packet).map(line => `- ${line}`),
    ...(rec ? rec.artists.flatMap(artist => [`- **${artist.name}** · ${money(artist.fee)} (${FEE_STATUS[artist.feeStatus] ?? artist.feeStatus}; availability: ${AVAILABILITY[artist.availability] ?? artist.availability})`, ...artist.claims.map(claim => `  - ${claim.text}${claim.receipts.length ? ` [${claim.receipts.map(row => row.id).join(', ')}]` : ''}`)]) : []),
    '', '## 3. Strategies compared under the same constraints and scenarios',
    '| Strategy | Bill | Artist fees | vs recommended | Disruption scenarios continued | Unchanged | Evidence coverage |',
    '|---|---|---|---|---|---|---|',
    ...packet.strategies.map(row => `| ${cell(row.label)} | ${cell(row.names.join(' + '))} | ${money(row.totalFee)} | ${row.id === 'cultural-fit' ? '—' : `${row.feeDelta >= 0 ? '+' : '−'}${money(Math.abs(row.feeDelta))}, −${row.scoreGap} pts`} | ${row.robustness.continued}/${row.robustness.total} | ${row.robustness.held} | ${Math.round(row.evidenceCompleteness * 100)}% |`),
    ...packet.strategies.map(row => `- **${row.label}:** ${row.rationale} ${row.preferWhen ?? ''}`),
    packet.robustNote ? `- ${packet.robustNote}` : null,
    `- Robustness definition: ${packet.robustnessDefinition?.scenarios ?? ''} ${packet.robustnessDefinition?.outcomes ?? ''}`,
    '', '## 4. Backups if an act becomes unavailable',
    ...(packet.backups.length ? packet.backups.map(row => `- ${row.name}: ${row.options.length ? row.options.map((option, index) => `${index + 1}) ${option.names.join(' + ')} (${money(option.totalFee)}, ${option.score} pts)`).join('; ') : 'no feasible replacement keeps the other acts'}`) : ['- No recommendation to back up.']),
    '', '## 5. Fees and availability (assumptions, not verified facts)',
    '| Artist | Fee | Fee status | Availability | Needs confirmation |',
    '|---|---|---|---|---|',
    ...packet.terms.map(row => `| ${cell(row.name)} | ${row.fee == null ? '—' : money(row.fee)} | ${FEE_STATUS[row.feeStatus] ?? row.feeStatus} | ${AVAILABILITY[row.availability] ?? row.availability} | ${row.needsConfirmation ? 'Yes' : 'No'} |`),
    '', '## 6. Budget and financial sensitivity',
    `- Planned artist fees ${money(packet.financial.plannedFees)} of ${money(packet.financial.artistBudget)}; ${money(packet.financial.headroom)} unallocated.`,
    ...packet.financial.breakpoints.map(row => `- ${row.text}`),
    packet.financial.commercial ? `- Commercial assumptions (promoter-entered, unverified): capacity ${packet.financial.commercial.capacity ?? '—'}, ticket price ${packet.financial.commercial.ticketPrice == null ? '—' : money(packet.financial.commercial.ticketPrice)}, other costs ${money(packet.financial.commercial.otherCosts ?? 0)}. Break-even: ${packet.financial.commercial.breakEvenTickets ?? '—'} paid tickets${packet.financial.commercial.breakEvenShare != null ? ` (${packet.financial.commercial.breakEvenShare}% of capacity)` : ''}. Arithmetic on assumptions, not a sales forecast.` : '- No ticket price or capacity was entered; no break-even is calculated.',
    '', '## 7. Cultural evidence and research',
    `Fit basis: ${fitBasisText(packet)}.`,
    packet.research.verdict,
    `${packet.research.actionsExecuted} research action(s), ${packet.research.callsUsed}/${packet.research.callBudget} Qloo workflow calls. Stop: ${packet.research.stop.decision}; stress follow-up: ${packet.research.stop.followup}.`,
    '| Artist | Role | Rank | Local | Audience comparison | Trend |',
    '|---|---|---|---|---|---|',
    ...packet.evidenceMatrix.map(row => `| ${cell(row.name)} | ${row.role} | ${['rank', 'local', 'comparison', 'trends'].map(kind => `${row.cells[kind].label}${row.cells[kind].receipts.length ? ` [${row.cells[kind].receipts.join(', ')}]` : ''}`).join(' | ')} |`),
    '', '## 8. Stress test',
    packet.robustness.summary,
    ...packet.robustness.vulnerabilities.map(row => `- ${row.severity}: ${row.text}`),
    '', '## 9. Remaining uncertainties',
    ...(packet.evidenceGaps.length ? packet.evidenceGaps.map(row => `- ${row.question} — ${row.status}. ${row.why}`) : ['- No open evidence questions.']),
    ...packet.confirmations.map(row => `- Confirm: ${row}`),
    '', '## 10. Next actions',
    ...packet.actions.map(row => `${row.priority}. [${row.type === 'approval' ? 'Requires human approval' : row.type === 'confirm' ? 'Confirm with agent' : 'Recommendation'}] ${row.text}`),
    '', '## 11. Assumptions and limits',
    ...packet.assumptions.map(row => `- ${row}`),
    `- ${packet.limits}`,
    '', '## Appendix: Qloo receipt index',
    '| Receipt | Tool | Status | Source | Retrieved | Content digest |',
    '|---|---|---|---|---|---|',
    ...packet.receiptIndex.map(row => `| ${row.id} | ${row.tool} | ${row.status} | ${row.source} | ${row.fetchedAt ?? '—'} | ${row.contentDigest ? row.contentDigest.slice(0, 19) + '…' : '—'} |`),
    packet.integrity ? `Integrity: manifest ${packet.integrity.manifestDigest ?? 'not attached'}. ${packet.integrity.statement}` : null,
    '',
  ]);
}

export function packetHtml(packet, money, { notice = '' } = {}) {
  const rec = packet.recommendation, brief = packet.brief, h = escapeHtml;
  const table = (head, rows) => `<table><thead><tr>${head.map(value => `<th scope="col">${h(value)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const actionType = { approval: 'Requires human approval', confirm: 'Confirm with agent', recommendation: 'Recommendation' };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(brief.name || `${brief.city} booking decision`)} — Houselights packet</title><style>
body{font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:900px;margin:2rem auto;padding:0 16px;color:#1d1b17;background:#f7f6f2}
h1{font:600 1.7rem/1.2 Georgia,serif;margin:.2rem 0}h2{font:600 1.1rem/1.3 Georgia,serif;margin:1.8rem 0 .6rem;padding-top:.8rem;border-top:1px solid #d9d4c7}
.mode{display:inline-block;padding:4px 8px;border-radius:4px;background:#ece6f8;color:#3f2a7a;font:600 11px/1.4 ui-monospace,monospace;letter-spacing:.4px}
.mode.synthetic{background:#fcedf0;color:#a33346}.notice{font-size:13px;color:#5b5664}.rec{padding:14px 16px;border:2px solid #7357c8;border-radius:8px;background:#fff}
.rec strong{font:600 1.35rem Georgia,serif}table{width:100%;border-collapse:collapse;margin:.5rem 0;font-size:13px;background:#fff}th,td{border:1px solid #ddd8cc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f0ece3}
.tag{font:600 10px ui-monospace,monospace;padding:2px 5px;border-radius:3px;background:#eee;white-space:nowrap}.approval{background:#fbf6ea;color:#7a5512}.confirm{background:#fcedf0;color:#a33346}.recommendation{background:#e8f1eb;color:#285a3c}
ul,ol{padding-left:1.3rem}li{margin:.25rem 0}.muted{color:#5b5664;font-size:12.5px}code{font-size:11px;word-break:break-all}
@media print{body{background:#fff;margin:0;max-width:none}h2{break-after:avoid}table,tr,.rec{break-inside:avoid}}
</style></head><body>
<p><span class="mode${packet.mode === 'synthetic' ? ' synthetic' : ''}">${h(MODE[packet.mode] ?? packet.mode)}</span></p>
${notice ? `<p class="notice">${h(notice)}</p>` : ''}
<h1>${h(brief.name || `${brief.city} booking decision`)}</h1>
<p class="muted">Houselights decision packet · generated ${h(packet.generatedAt)} · decision support only: nothing has been booked, offered or approved.</p>
<h2>1. Event brief</h2><ul><li>Market: ${h(brief.city)}${brief.venue ? ` · Venue: ${h(brief.venue)}` : ''}${brief.date ? ` · Date: ${h(brief.date)}` : ''}</li>${brief.direction ? `<li>Programming direction <em>(context only)</em>: ${h(brief.direction)}</li>` : ''}${brief.audience ? `<li>Target audience <em>(context only; Qloo uses the reference artists)</em>: ${h(brief.audience)}</li>` : ''}<li>Audience reference artists (Qloo anchors): ${h(brief.anchors.join(', ') || '—')}</li>${brief.objectives?.length ? `<li>Objectives <em>(context only, not used in the calculation)</em>: ${h(brief.objectives.join('; '))}</li>` : ''}<li>${h(brief.slots)} slots · ${h(money(brief.budget))} artist budget · max ${h(brief.maxPerGenre)} per genre · ${h(brief.candidates)} candidates${brief.locked?.length ? ` · locked: ${h(brief.locked.join(', '))}` : ''}${brief.excluded?.length ? ` · excluded: ${h(brief.excluded.join(', '))}` : ''}</li></ul>
<h2>2. Recommendation <span class="tag approval">for human approval</span></h2>
${rec ? `<div class="rec"><strong>${h(rec.names.join(' + '))}</strong><p>${h(money(rec.totalFee))} planned artist fees · ${h(money(rec.headroom))} unallocated · ${h(rec.policyScore)} policy points</p>${rec.provisional ? `<p><strong>Provisional:</strong> ${h(rec.provisionalReason)}</p>` : ''}${rec.why ? `<p>${h(rec.why)}</p>` : ''}${tieLines(packet).map(line => `<p><strong>${h(line.split(':')[0])}:</strong>${h(line.slice(line.indexOf(':') + 1))}</p>`).join('')}</div>
${table(['Artist', 'Fee', 'Fee status', 'Availability', 'Cultural rationale (Qloo receipts)'], rec.artists.map(artist => [h(artist.name), h(money(artist.fee)), h(FEE_STATUS[artist.feeStatus] ?? artist.feeStatus), h(AVAILABILITY[artist.availability] ?? artist.availability), `<ul>${artist.claims.map(claim => `<li>${h(claim.text)}${claim.receipts.length ? ` <code>[${h(claim.receipts.map(row => row.id).join(', '))}]</code>` : ''}</li>`).join('')}</ul>`]))}`
    : `<div class="rec"><strong>No feasible lineup</strong><p>${h(packet.infeasibility.reasons.join(' '))}</p></div>`}
<h2>3. Strategies compared under the same constraints and scenarios</h2>
${table(['Strategy', 'Bill', 'Artist fees', 'vs recommended', 'Disruption scenarios continued', 'Unchanged', 'Evidence coverage'], packet.strategies.map(row => [h(row.label), h(row.names.join(' + ')), h(money(row.totalFee)), row.id === 'cultural-fit' ? '—' : h(`${row.feeDelta >= 0 ? '+' : '−'}${money(Math.abs(row.feeDelta))}, −${row.scoreGap} pts`), h(`${row.robustness.continued}/${row.robustness.total}`), h(row.robustness.held), h(`${Math.round(row.evidenceCompleteness * 100)}%`)]))}
<ul>${packet.strategies.map(row => `<li><strong>${h(row.label)}:</strong> ${h(row.rationale)} ${h(row.preferWhen ?? '')}</li>`).join('')}${packet.robustNote ? `<li>${h(packet.robustNote)}</li>` : ''}</ul>
<p class="muted">Robustness: ${h(packet.robustnessDefinition?.scenarios ?? '')} ${h(packet.robustnessDefinition?.outcomes ?? '')}</p>
<h2>4. Backups if an act becomes unavailable</h2><ul>${packet.backups.map(row => `<li>${h(row.name)}: ${row.options.length ? row.options.map((option, index) => h(`${index + 1}) ${option.names.join(' + ')} (${money(option.totalFee)}, ${option.score} pts)`)).join('; ') : 'no feasible replacement keeps the other acts'}</li>`).join('') || '<li>No recommendation to back up.</li>'}</ul>
<h2>5. Fees and availability <span class="tag confirm">assumptions, not verified facts</span></h2>
${table(['Artist', 'Fee', 'Fee status', 'Availability', 'Needs confirmation'], packet.terms.map(row => [h(row.name), h(row.fee == null ? '—' : money(row.fee)), h(FEE_STATUS[row.feeStatus] ?? row.feeStatus), h(AVAILABILITY[row.availability] ?? row.availability), row.needsConfirmation ? '<strong>Yes</strong>' : 'No']))}
<h2>6. Budget and financial sensitivity</h2><ul><li>Planned artist fees ${h(money(packet.financial.plannedFees))} of ${h(money(packet.financial.artistBudget))}; ${h(money(packet.financial.headroom))} unallocated.</li>${packet.financial.breakpoints.map(row => `<li>${h(row.text)}</li>`).join('')}
<li>${packet.financial.commercial ? h(`Commercial assumptions (promoter-entered, unverified): capacity ${packet.financial.commercial.capacity ?? '—'}, ticket price ${packet.financial.commercial.ticketPrice == null ? '—' : money(packet.financial.commercial.ticketPrice)}, other costs ${money(packet.financial.commercial.otherCosts ?? 0)}. Break-even: ${packet.financial.commercial.breakEvenTickets ?? '—'} paid tickets${packet.financial.commercial.breakEvenShare != null ? ` (${packet.financial.commercial.breakEvenShare}% of capacity)` : ''}. Arithmetic on assumptions, not a sales forecast.`) : 'No ticket price or capacity was entered; no break-even is calculated.'}</li></ul>
<h2>7. Cultural evidence and research</h2><p class="muted">Fit basis: ${h(fitBasisText(packet))}.</p><p>${h(packet.research.verdict)}</p><p class="muted">${h(`${packet.research.actionsExecuted} research action(s), ${packet.research.callsUsed}/${packet.research.callBudget} Qloo workflow calls. Stop: ${packet.research.stop.decision}; stress follow-up: ${packet.research.stop.followup}.`)}</p>
${table(['Artist', 'Role', 'Rank', 'Local', 'Audience comparison', 'Trend'], packet.evidenceMatrix.map(row => [h(row.name), h(row.role), ...['rank', 'local', 'comparison', 'trends'].map(kind => `${h(row.cells[kind].label)}${row.cells[kind].receipts.length ? ` <code>[${h(row.cells[kind].receipts.join(', '))}]</code>` : ''}`)]))}
<p class="muted">Cultural affinity describes taste relationships. It is not ticket demand, attendance or revenue.</p>
<h2>8. Stress test</h2><p>${h(packet.robustness.summary)}</p><ul>${packet.robustness.vulnerabilities.map(row => `<li><span class="tag">${h(row.severity)}</span> ${h(row.text)}</li>`).join('')}</ul>
<h2>9. Remaining uncertainties</h2><ul>${packet.evidenceGaps.map(row => `<li>${h(row.question)} — <em>${h(row.status)}</em>. ${h(row.why)}</li>`).join('') || '<li>No open evidence questions.</li>'}${packet.confirmations.map(row => `<li>Confirm: ${h(row)}</li>`).join('')}</ul>
<h2>10. Next actions</h2><ol>${packet.actions.map(row => `<li><span class="tag ${h(row.type)}">${h(actionType[row.type] ?? row.type)}</span> ${h(row.text)}</li>`).join('')}</ol>
<h2>11. Assumptions and limits</h2><ul>${packet.assumptions.map(row => `<li>${h(row)}</li>`).join('')}<li>${h(packet.limits)}</li></ul>
<h2>Appendix: Qloo receipt index</h2>${table(['Receipt', 'Tool', 'Status', 'Source', 'Retrieved', 'Content digest'], packet.receiptIndex.map(row => [h(row.id), h(row.tool), h(row.status), h(row.source), h(row.fetchedAt ?? '—'), `<code>${h(row.contentDigest ?? '—')}</code>`]))}
${packet.integrity ? `<p class="muted">Integrity: manifest <code>${h(packet.integrity.manifestDigest ?? 'not attached')}</code>. ${h(packet.integrity.statement)}</p>` : ''}
</body></html>`;
}
