import { capacityFromReview } from './capacity-evidence.mjs';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const ROOM_RULES = Object.freeze({ minimumCapacityRatio: 0.6, maximumCapacityRatio: 2.5 });

function positiveMoney(value, label, { allowZero = true } = {}) {
  if (!finite(value) || value < (allowZero ? 0 : .01) || value > 1e9) throw new Error(`${label} must be a valid ${allowZero ? 'non-negative' : 'positive'} amount.`);
  return money(value);
}

function classification(capacity, crowd) {
  if (capacity < crowd * ROOM_RULES.minimumCapacityRatio) return 'too_small';
  if (capacity > crowd * ROOM_RULES.maximumCapacityRatio) return 'oversized';
  return 'fit';
}

function normalizeInput(snapshot, raw) {
  if (!snapshot?.intelligence?.route?.feasible) throw new Error('A saved feasible intelligence route is required before venue qualification.');
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const expectedCrowd = Number(value.expectedCrowd);
  if (!Number.isInteger(expectedCrowd) || expectedCrowd < 1 || expectedCrowd > 200000) throw new Error('expectedCrowd must be an integer from 1 to 200000.');
  const ticketPrice = positiveMoney(value.ticketPrice, 'ticketPrice', { allowZero: false });
  const variableCostPerAttendee = positiveMoney(value.variableCostPerAttendee ?? 0, 'variableCostPerAttendee');
  if (variableCostPerAttendee >= ticketPrice) throw new Error('variableCostPerAttendee must be lower than ticketPrice so break-even exists.');
  const travelCostPerKm = positiveMoney(value.travelCostPerKm ?? 0, 'travelCostPerKm');
  const artistFeeMode = String(value.artistFeeMode || '');
  if (!['per_stop', 'whole_route'].includes(artistFeeMode)) throw new Error('artistFeeMode must be per_stop or whole_route.');
  const leads = new Map(snapshot.intelligence.venueScouting.flatMap(group => group.candidates.map(candidate => [`${group.market}\0${candidate.id}`, { ...candidate, market: group.market, receiptId: group.receiptId }])));
  const rows = Array.isArray(value.qualifications) ? value.qualifications : [];
  if (rows.length > 80) throw new Error('Provide at most 80 venue qualifications.');
  const seen = new Set();
  const qualifications = rows.map((rawRow, index) => {
    const row = rawRow && typeof rawRow === 'object' && !Array.isArray(rawRow) ? rawRow : {};
    const market = String(row.market || '').trim().slice(0, 100), venueId = String(row.venueId || '').trim().slice(0, 180);
    const key = `${market}\0${venueId}`, lead = leads.get(key);
    if (!lead) throw new Error(`Qualification ${index + 1} must reference a Qloo place candidate from the saved route.`);
    if (seen.has(key)) throw new Error('Each routed venue candidate can be qualified only once.');
    seen.add(key);
    const reviewed = row.useCapacityEvidence === true ? capacityFromReview(snapshot, row) : null;
    const capacity = Number(reviewed?.capacity ?? row.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000000) throw new Error(`Qualification ${index + 1} needs an integer capacity from 1 to 1000000.`);
    const capacitySource = String(reviewed?.capacitySource ?? row.capacitySource ?? '').trim().slice(0, 500);
    if (!capacitySource) throw new Error(`Qualification ${index + 1} needs a capacitySource.`);
    return {
      market, venueId, venueName: lead.name, qlooReceiptId: lead.receiptId,
      capacity, capacitySource, ...(reviewed ? { capacityEvidence: reviewed.capacityEvidence } : {}), available: row.available === true,
      venueCost: positiveMoney(row.venueCost ?? 0, `Qualification ${index + 1} venueCost`),
      otherFixedCost: positiveMoney(row.otherFixedCost ?? 0, `Qualification ${index + 1} otherFixedCost`)
    };
  });
  return { expectedCrowd, ticketPrice, variableCostPerAttendee, travelCostPerKm, artistFeeMode, qualifications };
}

function ranked(rows, expectedCrowd) {
  return rows.map(row => ({
    ...row, capacityRatio: money(row.capacity / expectedCrowd), roomFit: classification(row.capacity, expectedCrowd),
    capacityDistance: Math.abs(Math.log(row.capacity / expectedCrowd))
  })).sort((a, b) =>
    Number(b.available) - Number(a.available) ||
    Number(b.roomFit === 'fit') - Number(a.roomFit === 'fit') ||
    a.capacityDistance - b.capacityDistance || a.venueCost - b.venueCost || a.venueName.localeCompare(b.venueName)
  );
}

function scenarios(fixedCost, netTicket, crowd, capacity) {
  return [50, 70, 90, 100].map(attendancePercent => {
    const plannedAttendance = Math.round(crowd * attendancePercent / 100);
    const attendance = Math.min(plannedAttendance, capacity ?? plannedAttendance);
    const grossRevenue = money(attendance * (netTicket));
    return { attendancePercent, plannedAttendance, attendanceAfterCapacityCap: attendance, netTicketRevenue: grossRevenue, contributionAfterDeclaredCosts: money(grossRevenue - fixedCost) };
  });
}

export function buildVenuePlan(snapshot, raw) {
  const input = normalizeInput(snapshot, raw);
  const selectedIds = new Set(snapshot.memo.slate.selectedIds);
  const selected = snapshot.memo.items.filter(item => selectedIds.has(item.id));
  const artistFeeTotal = money(selected.reduce((sum, item) => sum + (item.terms?.fee || 0), 0));
  const routeStops = snapshot.intelligence.route.stops;
  const nominalAllocation = input.artistFeeMode === 'per_stop' ? artistFeeTotal : money(artistFeeTotal / routeStops.length);
  const artistFeeAllocations = routeStops.map((_stop, index) => input.artistFeeMode === 'per_stop' || index < routeStops.length - 1
    ? nominalAllocation
    : money(artistFeeTotal - nominalAllocation * (routeStops.length - 1)));
  const netTicket = money(input.ticketPrice - input.variableCostPerAttendee);
  const stops = routeStops.map((stop, index) => {
    const candidates = ranked(input.qualifications.filter(row => row.market === stop.name), input.expectedCrowd);
    const available = candidates.filter(row => row.available);
    const selectedVenue = available.find(row => row.roomFit === 'fit') || available[0] || null;
    const travelCost = money(stop.fromKm * input.travelCostPerKm);
    const artistFeeAllocation = artistFeeAllocations[index];
    const declaredFixedCost = money(artistFeeAllocation + travelCost + (selectedVenue?.venueCost || 0) + (selectedVenue?.otherFixedCost || 0));
    const breakEvenTickets = Math.ceil(declaredFixedCost / netTicket);
    return {
      market: stop.name, sequence: stop.sequence, showDate: stop.showDate, from: stop.from, fromKm: stop.fromKm,
      qualificationStatus: selectedVenue ? selectedVenue.roomFit === 'fit' ? 'qualified_fit' : 'fallback_out_of_band' : 'needs_verified_venue',
      selectedVenue: selectedVenue ? { ...selectedVenue, capacityDistance: undefined } : null,
      alternatives: candidates.filter(row => row.venueId !== selectedVenue?.venueId).map(row => ({ ...row, capacityDistance: undefined })),
      economics: {
        currency: snapshot.memo.currency || snapshot.input?.currency || 'GBP', artistFeeAllocation, travelCost,
        venueCost: selectedVenue?.venueCost ?? null, otherFixedCost: selectedVenue?.otherFixedCost ?? null,
        declaredFixedCost, ticketPrice: input.ticketPrice, variableCostPerAttendee: input.variableCostPerAttendee,
        netPerTicket: netTicket, breakEvenTickets,
        breakEvenWithinCapacity: selectedVenue ? breakEvenTickets <= selectedVenue.capacity : null,
        scenarios: scenarios(declaredFixedCost, netTicket, input.expectedCrowd, selectedVenue?.capacity)
      },
      action: selectedVenue
        ? selectedVenue.roomFit === 'fit' ? 'Verify the remaining event terms and request a hold.' : 'No in-band room is available; review this labeled fallback or source another room.'
        : 'Verify capacity, availability and costs for at least one saved Qloo place candidate.'
    };
  });
  const routeArtistFees = input.artistFeeMode === 'per_stop' ? money(artistFeeTotal * stops.length) : artistFeeTotal;
  const routeTravelCost = money(stops.reduce((sum, stop) => sum + stop.economics.travelCost, 0));
  const routeVenueAndOtherCost = money(stops.reduce((sum, stop) => sum + (stop.economics.venueCost || 0) + (stop.economics.otherFixedCost || 0), 0));
  const { qualifications: _privateQualifications, ...publicInput } = input;
  return {
    version: '1.0', generatedAt: new Date().toISOString(), sourceId: snapshot.id,
    input: publicInput, rules: ROOM_RULES,
    artistFees: { mode: input.artistFeeMode, selectedArtistTotal: artistFeeTotal, routeArtistFees, allocations: stops.map(stop => ({ market: stop.market, amount: stop.economics.artistFeeAllocation })) },
    routeEconomics: {
      currency: snapshot.memo.currency || snapshot.input?.currency || 'GBP', routeArtistFees, routeTravelCost, routeVenueAndOtherCost,
      totalDeclaredFixedCost: money(routeArtistFees + routeTravelCost + routeVenueAndOtherCost),
      qualifiedStops: stops.filter(stop => stop.qualificationStatus === 'qualified_fit').length,
      fallbackStops: stops.filter(stop => stop.qualificationStatus === 'fallback_out_of_band').length,
      unqualifiedStops: stops.filter(stop => stop.qualificationStatus === 'needs_verified_venue').length
    },
    stops,
    limitations: [
      'Expected crowd, prices, costs, availability and capacity sources are caller-supplied planning facts; Houselights does not independently verify them.',
      'Attendance scenarios are arithmetic at declared percentages of expected crowd. They are not attendance, revenue or profit forecasts.',
      'Qloo place recommendations provide cultural context and do not establish capacity, suitability, availability or commercial terms.',
      'Travel cost uses great-circle leg distance as a planning proxy, not road mileage or a carrier quote.',
      'Contribution excludes every cost not entered here, including taxes and settlement terms.'
    ]
  };
}
