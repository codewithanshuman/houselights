// Ported from an owner-supplied MIT reference, (c) 2026 ZNLong2203. See ./LICENSE.
// Market DNA: compare what two markets love, domain by domain. Pure functions and types so the API
// route computes the overlap and the client page can import the shapes without pulling in server code.


/** Domains compared side by side (podcasts are left out: Qloo's local podcast signal is thin outside big metros). */
export const DNA_KINDS = ["movie", "tv_show", "artist", "videogame", "book"]                                         ;
/** How deep each market's list goes: Qloo normalizes affinity per query, so we compare membership and rank, never raw scores. */
export const DNA_DEPTH = 25;
const ONLY_TAKE = 6;
/** A shared entity "leans" to a market when it ranks at least this many places higher there. */
const LEAN_MIN_GAP = 5;















































const round = (n        , d = 3) => Number(n.toFixed(d));

function shareOf(entity            , rankA        , rankB        )               {
  return { id: entity.id, name: entity.name, kind: entity.kind, image: entity.image, rankA, rankB };
}

/** Overlap between two top lists for one domain. Both lists must be in local-rank order. */
export function compareDomain(kind            , listA              , listB              )                {
  const a = listA.slice(0, DNA_DEPTH);
  const b = listB.slice(0, DNA_DEPTH);
  const rankInB = new Map(b.map((e, i) => [e.id, i + 1]));
  const rankInA = new Map(a.map((e, i) => [e.id, i + 1]));

  const shared = a
    .flatMap((e, i) => {
      const rankB = rankInB.get(e.id);
      return rankB ? [shareOf(e, i + 1, rankB)] : [];
    })
    .sort((x, y) => x.rankA + x.rankB - (y.rankA + y.rankB) || x.rankA - y.rankA);
  const uniqueToA = a.filter((e) => !rankInB.has(e.id));
  const uniqueToB = b.filter((e) => !rankInA.has(e.id));
  const union = a.length + b.length - shared.length;

  return {
    kind,
    poolA: a.length,
    poolB: b.length,
    shared,
    sharedCount: shared.length,
    jaccard: union ? round(shared.length / union) : 0,
    onlyA: uniqueToA.slice(0, ONLY_TAKE),
    onlyB: uniqueToB.slice(0, ONLY_TAKE),
    uniqueA: uniqueToA.length,
    uniqueB: uniqueToB.length,
    leansA: shared
      .filter((s) => s.rankB - s.rankA >= LEAN_MIN_GAP)
      .sort((x, y) => y.rankB - y.rankA - (x.rankB - x.rankA))
      .slice(0, ONLY_TAKE),
    leansB: shared
      .filter((s) => s.rankA - s.rankB >= LEAN_MIN_GAP)
      .sort((x, y) => y.rankA - y.rankB - (x.rankA - x.rankB))
      .slice(0, ONLY_TAKE),
  };
}

/** Compare every domain both scans answered, in DNA_KINDS order. */
export function compareMarkets(a            , b            )                  {
  const byKindB = new Map(b.domains.map((d) => [d.kind, d.entities]));
  const order = (kind            ) => (DNA_KINDS                         ).indexOf(kind);
  return a.domains
    .filter((d) => byKindB.has(d.kind))
    .map((d) => compareDomain(d.kind, d.entities, byKindB.get(d.kind) ?? []))
    .sort((x, y) => order(x.kind) - order(y.kind));
}
