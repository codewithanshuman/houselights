// An intentionally small, inspectable model. Nothing is fitted until genuine
// outcomes are recorded. The held-out period is never used for fitting.
import { createHash } from 'node:crypto';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const baseFields = ['logCapacity', 'logPrice', 'competition', 'actCount'];
const qlooFields = ['qlooMean', 'qlooCoverage', 'localFraction'];
const logit = value => Math.log(value / (1 - value));
const sigmoid = value => 1 / (1 + Math.exp(-clamp(value, -30, 30)));
const round = value => Math.round(value * 10000) / 10000;

export function qlooProtocol(source) {
  const ids = source?.memo?.items?.map(item => String(item.id || '').trim().toLowerCase()).filter(Boolean);
  if (!ids || ids.length < 2 || new Set(ids).size !== ids.length) return null;
  return 'relative-rank-v1:' + createHash('sha256').update(JSON.stringify(ids.sort())).digest('hex').slice(0, 24);
}

export function demandFeatures(brief, selected) {
  const known = selected.filter(item => item.qloo?.rank === true && Number.isFinite(item.qloo.fit));
  return {
    city:brief.city,
    qlooProtocol:brief.qlooProtocol??null,
    logCapacity: Math.log(brief.capacity), logPrice: Math.log(brief.ticketPrice),
    competition: brief.competitionCount, actCount: selected.length,
    qlooMean: known.length ? known.reduce((sum, item) => sum + item.qloo.fit, 0) / known.length : null,
    qlooCoverage: selected.length ? known.length / selected.length : 0,
    localFraction: selected.length ? selected.filter(item => item.qloo?.local === true).length / selected.length : 0,
  };
}

const featureValue = (row, field) => field.startsWith('city:') ? Number(String(row.features.city).toLowerCase() === field.slice(5)) : row.features[field];
function cityFields(rows) {
  const counts=new Map();
  for(const row of rows){const city=String(row.features.city||row.city||'').toLowerCase();counts.set(city,(counts.get(city)||0)+1);}
  const eligible=[...counts].filter(([city,count])=>city&&count>=5).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  return eligible.length>1?eligible.slice(1,9).map(([city])=>`city:${city}`):[];
}

function solve(matrix, vector) {
  const a = matrix.map((row, index) => [...row, vector[index]]), n = a.length;
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    if (Math.abs(a[pivot][column]) < 1e-10) return null;
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const divisor = a[column][column];
    for (let cell = column; cell <= n; cell++) a[column][cell] /= divisor;
    for (let row = 0; row < n; row++) if (row !== column) {
      const factor = a[row][column];
      for (let cell = column; cell <= n; cell++) a[row][cell] -= factor * a[column][cell];
    }
  }
  return a.map(row => row[n]);
}

function fit(rows, fields) {
  const means = Object.fromEntries(fields.map(field => [field, rows.reduce((sum, row) => sum + featureValue(row,field), 0) / rows.length]));
  const scales = Object.fromEntries(fields.map(field => [field, Math.max(1e-6, Math.sqrt(rows.reduce((sum, row) => sum + (featureValue(row,field) - means[field]) ** 2, 0) / rows.length))]));
  const vectors = rows.map(row => [1, ...fields.map(field => (featureValue(row,field) - means[field]) / scales[field])]);
  const targets = rows.map(row => logit(clamp((row.paidTicketsSold + .5) / (row.capacity + 1), 1e-6, 1 - 1e-6)));
  const size = fields.length + 1, gram = Array.from({length:size}, () => Array(size).fill(0)), rhs = Array(size).fill(0);
  for (let index = 0; index < rows.length; index++) for (let a = 0; a < size; a++) {
    rhs[a] += vectors[index][a] * targets[index];
    for (let b = 0; b < size; b++) gram[a][b] += vectors[index][a] * vectors[index][b];
  }
  for (let index = 1; index < size; index++) gram[index][index] += 4; // fixed regularization; no holdout tuning
  const coefficients = solve(gram, rhs);
  return coefficients ? {fields, means, scales, coefficients,seenCities:[...new Set(rows.map(row=>String(row.features.city||row.city||'').toLowerCase()))]} : null;
}

function predict(model, features) {
  const terms = Object.fromEntries(model.fields.map((field, index) => [field, model.coefficients[index + 1] * (featureValue({features},field) - model.means[field]) / model.scales[field]]));
  return {occupancy: sigmoid(model.coefficients[0] + Object.values(terms).reduce((sum, value) => sum + value, 0)), terms};
}

function evaluate(model, rows, fixedWidth = null) {
  const errors = rows.map(row => predict(model, row.features).occupancy - row.paidTicketsSold / row.capacity);
  const absolute = errors.map(Math.abs).sort((a, b) => a - b);
  // Split-conformal absolute-residual quantile at nominal 90% coverage.
  const quantileIndex = Math.min(absolute.length - 1, Math.ceil(.9 * (absolute.length + 1)) - 1);
  const width = fixedWidth ?? absolute[quantileIndex];
  return {count:rows.length, mae:round(absolute.reduce((sum, value) => sum + value, 0) / rows.length),
    intervalHalfWidth:width, empiricalCoverage:fixedWidth==null?null:round(errors.filter(value => Math.abs(value) <= width + 1e-12).length / rows.length)};
}

const valid = row => row && row.synthetic !== true && row.provenance?.realOutcome === true && row.provenance?.preEventFeatures === true &&
  typeof row.eventDate === 'string' && Number.isInteger(row.capacity) && row.capacity > 0 &&
  Number.isInteger(row.paidTicketsSold) && row.paidTicketsSold >= 0 && row.paidTicketsSold <= row.capacity &&
  baseFields.every(field => Number.isFinite(row.features?.[field]));
const hasQloo = row => row.features?.qlooCoverage === 1 && qlooFields.every(field => Number.isFinite(row.features?.[field])) &&
  row.provenance?.qlooPreEvent === true && typeof row.provenance?.qlooProtocol === 'string' &&
  row.provenance.qlooProtocol === row.features.qlooProtocol;

export function trainDemandModel(outcomes) {
  const candidates = outcomes.filter(valid).sort((a,b) => a.eventDate.localeCompare(b.eventDate) ||
    Number(b.provenance?.classification === 'prospective') - Number(a.provenance?.classification === 'prospective') ||
    String(a.forecastGeneratedAt||a.createdAt||'').localeCompare(String(b.forecastGeneratedAt||b.createdAt||'')) || String(a.id).localeCompare(String(b.id)));
  // Multiple saved planning versions of one concert must not manufacture a larger sample.
  const seenEvents = new Set();
  const rows = candidates.filter(row => {
    const key = row.eventKey || [row.eventDate,String(row.city||row.features.city).toLowerCase(),row.capacity].join('|');
    if (seenEvents.has(key)) return false;
    seenEvents.add(key); return true;
  });
  if (rows.length < 40) return {status:'insufficient_outcomes', eligible:rows.length, required:40,
    duplicatesExcluded:candidates.length-rows.length,
    reason:'At least 40 distinct real, sourced events with pre-event features are required before a paid-ticket model is exposed.'};
  const trainEnd = Math.floor(rows.length * .6), calibrationEnd = Math.floor(rows.length * .8);
  const train = rows.slice(0, trainEnd), calibration = rows.slice(trainEnd,calibrationEnd), test = rows.slice(calibrationEnd);
  if (train.length<24||calibration.length<8||test.length < 8 || train.at(-1).eventDate >= calibration[0].eventDate || calibration.at(-1).eventDate >= test[0].eventDate) return {status:'insufficient_time_separation',eligible:rows.length,
    reason:'Training, calibration and final test events must be chronologically distinct, with at least 24/8/8 records respectively.'};
  const baseline = fit(train, [...baseFields,...cityFields(train)]);
  if (!baseline) return {status:'fit_failed',eligible:rows.length};
  const baselineCalibration=evaluate(baseline,calibration),baselineTest = evaluate(baseline, test,baselineCalibration.intervalHalfWidth);
  const cohorts = new Map();
  for (const row of rows.filter(hasQloo)) {
    const protocol=row.provenance.qlooProtocol;
    if(!cohorts.has(protocol))cohorts.set(protocol,[]);
    cohorts.get(protocol).push(row);
  }
  const [comparisonProtocol,qlooRows=[]]=[...cohorts].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]))[0]??[];
  const qTrainEnd=Math.floor(qlooRows.length*.6),qCalibrationEnd=Math.floor(qlooRows.length*.8);
  let qlooComparison = null, qlooModel = null;
  if (qlooRows.length >= 40 && qTrainEnd>=24 && qCalibrationEnd-qTrainEnd>=8 && qlooRows.length-qCalibrationEnd>=8 &&
    qlooRows[qTrainEnd-1].eventDate<qlooRows[qTrainEnd].eventDate&&qlooRows[qCalibrationEnd-1].eventDate<qlooRows[qCalibrationEnd].eventDate) {
    const qTrain=qlooRows.slice(0,qTrainEnd),qCalibration=qlooRows.slice(qTrainEnd,qCalibrationEnd),qTest=qlooRows.slice(qCalibrationEnd);
    const matchedFields=[...baseFields,...cityFields(qTrain)];
    const matchedBaseline=fit(qTrain,matchedFields), augmented=fit(qTrain,[...matchedFields,...qlooFields]);
    if(matchedBaseline&&augmented){
      const withoutCalibration=evaluate(matchedBaseline,qCalibration),withCalibration=evaluate(augmented,qCalibration);
      const withoutQloo=evaluate(matchedBaseline,qTest,withoutCalibration.intervalHalfWidth);
      const withQloo=evaluate(augmented,qTest,withCalibration.intervalHalfWidth);
      qlooComparison={cohort:qlooRows.length,protocol:comparisonProtocol,train:qTrain.length,calibration:qCalibration.length,heldOut:qTest.length,withoutQloo,withQloo,
        deltaMae:round(withQloo.mae-withoutQloo.mae),qlooImproved:withQloo.mae<withoutQloo.mae,
        interpretation:'Paired final-period test on the same Qloo-covered cohort and fixed candidate-pool protocol. Intervals were set on an earlier calibration period. Lower MAE is better; association is not a causal effect of Qloo.'};
      qlooModel=augmented;
    }
  }
  return {status:'backtested',eligible:rows.length,duplicatesExcluded:candidates.length-rows.length,train:train.length,calibration:calibration.length,heldOut:test.length,
    trainingCutoff:train.at(-1).eventDate,calibrationStart:calibration[0].eventDate,holdoutStart:test[0].eventDate,
    baseline:{model:baseline,calibration:baselineCalibration,heldOut:baselineTest},qlooModel,qlooComparison,
    provenance:'Outcome source references and pre-event Qloo timestamps are organizer-attested; chronological calibration and final test are independently recomputed by code.'};
}

export function predictDemand(modelReport, brief, features) {
  if (modelReport.status !== 'backtested') return null;
  const useQloo = !!modelReport.qlooModel && features.qlooCoverage === 1 && Number.isFinite(features.qlooMean) &&
    features.qlooProtocol === modelReport.qlooComparison?.protocol;
  const model = useQloo ? modelReport.qlooModel : modelReport.baseline.model;
  const validation = useQloo ? modelReport.qlooComparison.withQloo : modelReport.baseline.heldOut;
  const coldStart=!model.seenCities.includes(String(brief.city).toLowerCase());
  const width=Math.min(1,validation.intervalHalfWidth+(coldStart?.1:0));
  const point = predict(model, features), lower = clamp(point.occupancy - width, 0, 1), upper = clamp(point.occupancy + width, 0, 1);
  return {status:'backtested_association',model:useQloo?'qloo_augmented':'market_baseline',targetMetric:'paid_tickets_sold',
    ticketsSold:{low:Math.floor(lower*brief.capacity),point:Math.round(point.occupancy*brief.capacity),high:Math.ceil(upper*brief.capacity)},
    occupancy:{low:round(lower),point:round(point.occupancy),high:round(upper)},
    nominalIntervalCoverage:coldStart?null:.9,heldOut:validation,coldStartCity:coldStart,
    explanations:{intercept:round(model.coefficients[0]),terms:Object.fromEntries(Object.entries(point.terms).map(([key,value])=>[key,round(value)])),scale:'Contributions to log-odds of occupancy; observational associations, not causal effects.'},
    caveat:coldStart?'City was absent from training; range was widened by an uncalibrated 10 occupancy points. No coverage guarantee applies.':'Interval width uses the middle calibration period; error and empirical coverage use untouched later events. Coverage can fail under market shift; input source validity is organizer-attested.'};
}
