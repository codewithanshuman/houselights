import { db, transaction } from './database.mjs';

const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function validate(row) {
  if (!row || typeof row !== 'object' || !/^[A-Za-z0-9_-]{3,64}$/.test(row.sourceKey || '') ||
      !day(row.eventDate) || typeof row.headliner !== 'string' || !row.headliner.trim() ||
      typeof row.city !== 'string' || !row.city.trim() ||
      !['single_show_outcome', 'multi_show_aggregate', 'missing_capacity', 'invalid_paid_tickets'].includes(row.outcomeType) ||
      !Number.isInteger(row.showCount) || row.showCount < 1 ||
      !Number.isInteger(row.paidTicketsSold) || row.paidTicketsSold < 0 ||
      row.sourcePublisher !== 'Pollstar' || !/^https:\/\//.test(row.sourceUrl || '') ||
      row.trainingEligible !== false || row.sourceClassification !== 'publisher_reported_transcription_not_independently_audited') {
    throw new Error(`Invalid reported-outcome record ${row?.sourceKey ?? '(missing ID)'}.`);
  }
  if (row.outcomeType === 'single_show_outcome' &&
      (!Number.isInteger(row.sellableCapacity) || row.sellableCapacity < row.paidTicketsSold)) {
    throw new Error(`Invalid single-show capacity for ${row.sourceKey}.`);
  }
  return row;
}

export function importReportedOutcomes(report) {
  if (report?.schemaVersion !== 1 || !Array.isArray(report.catalog) || report.catalog.length > 500 ||
      report.catalog.length === 0 || report.summary?.zipMismatches?.length) {
    throw new Error('Expected a bounded audited source catalog with no workbook/ZIP mismatches.');
  }
  const rows = report.catalog.map(validate), keys = new Set(rows.map(row => row.sourceKey));
  if (keys.size !== rows.length) throw new Error('Duplicate IDs in the reported-outcome import.');
  const importedAt = new Date().toISOString();
  return transaction(() => {
    let inserted = 0;
    const existing = db.prepare('SELECT body FROM reported_outcomes WHERE source_key=?');
    const insert = db.prepare('INSERT INTO reported_outcomes(source_key,body,imported_at) VALUES(?,?,?)');
    for (const row of rows) {
      const body = JSON.stringify(row), previous = existing.get(row.sourceKey);
      if (previous && previous.body !== body) throw new Error(`Source ID ${row.sourceKey} already exists with different values.`);
      if (!previous) { insert.run(row.sourceKey, body, importedAt); inserted++; }
    }
    return {received:rows.length,inserted,alreadyPresent:rows.length-inserted,status:reportedOutcomeStatus()};
  });
}

export const listReportedOutcomes = () => db.prepare('SELECT body FROM reported_outcomes ORDER BY json_extract(body,\'$.eventDate\'),source_key')
  .all().map(row => JSON.parse(row.body));

export function reportedOutcomeStatus() {
  const rows = listReportedOutcomes();
  return {count:rows.length,singleShow:rows.filter(row => row.outcomeType === 'single_show_outcome').length,
    multiShow:rows.filter(row => row.outcomeType === 'multi_show_aggregate').length,
    missingCapacity:rows.filter(row => row.outcomeType === 'missing_capacity').length,
    trainingEligible:0,
    explanation:'Published paid-ticket outcomes are stored separately from model training. These records lack timestamped pre-event predictors and cannot establish forecasting accuracy or Qloo lift.'};
}
