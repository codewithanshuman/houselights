// Development fixtures only. These envelopes never represent Qloo evidence.
import { createHash } from 'node:crypto';
const h = value => parseInt(createHash('md5').update(String(value)).digest('hex').slice(0, 6), 16);
const known = new Map();
const entity = (name, entity_id = `mock-${h(name)}`) => {
  const row = { name, entity_id, type: 'urn:entity:artist' };
  known.set(entity_id, row);
  return row;
};
const phoenix = [entity('Phoenix (French band)', 'mock-p1'), entity('Phoenix (Romanian band)', 'mock-p2')];
const resolve = value => known.get(value) || [...known.values()].find(row => row.name === value) || entity(value);
const envelope = (results, status = results.length ? 'ok' : 'empty') => ({
  status, summary: 'SYNTHETIC DEVELOPMENT DATA — not from Qloo', results,
  result_count: results.length, mock: true,
  provenance: { source: 'Houselights synthetic fixtures', endpoint: 'local:mock' },
});

export function mockCall(tool, args) {
  switch (tool) {
    case 'describe': {
      if (/^phoenix$/i.test(args.entity.trim())) return {
        ...envelope([], 'needs_input'),
        resolution: { issues: [{ input: args.entity, field: 'entity', candidates: phoenix }] },
      };
      if (args.entity.startsWith('mock-') && !known.has(args.entity)) return envelope([]);
      return envelope([resolve(args.entity)]);
    }
    case 'entity_tags': return envelope(['indie rock', 'dream pop', 'lo-fi'].map(name => ({ name })));
    case 'audience_demographics': return envelope([{ name: 'age 25-34' }]);
    case 'recommend': {
      if (args.target_type === 'place') return envelope([1, 2, 3].map(i => ({ name: `Mock Venue ${i} · ${args.filter_location}`, entity_id: `mock-v-${h(args.filter_location)}-${i}`, type: 'urn:entity:place' })));
      if (args.target_type === 'artist') return envelope([1, 2, 3].map(i => entity(`Mock Discovery ${i}`, `mock-d${i}`)));
      const label = String(args.target_type || 'entity').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
      return envelope([1, 2, 3].map(i => ({ name: `Mock ${label} ${i}`, entity_id: `mock-${args.target_type}-${i}`, type: `urn:entity:${args.target_type}` })));
    }
    case 'rank': return envelope([...args.options].sort((a, b) => h(a) - h(b)).map(resolve));
    case 'where_popular': return envelope(h(args.entity) % 3 ? [{ name: args.within, query: { affinity: .42 } }] : []);
    case 'compare_audiences': return { ...envelope([], 'ok'), results: {
      shared: ['indie rock', 'shoegaze', 'club'].slice(0, 1 + (h(args.group_b[0]) % 3)).map(name => ({ name })),
    } };
    case 'trends': return { ...envelope([], 'ok'), series: args.entities.map(value => {
      const row = resolve(value);
      return { entity: { entityId: row.entity_id, name: row.name }, points: [], change: (h(value) % 7) - 3 };
    }) };
    default: return envelope([]);
  }
}
