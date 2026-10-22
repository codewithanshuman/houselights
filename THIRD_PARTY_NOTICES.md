# Third-party notices

## Festival research reference

The owner-supplied reference archive declares MIT, copyright (c) 2026 ZNLong2203. The original market comparison, scoring, scheduling, sensitivity and licensing utilities are preserved with TypeScript types removed in `server/theme-night`. The full notice and license are retained in [server/theme-night/LICENSE](server/theme-night/LICENSE). Houselights' festival research, GM and theme-season modules adapt those workflows to its existing Qloo harness and exact booking optimizer. See [the integration audit](docs/theme-night-integration.md) for exact ports, adaptations and remaining differences.

## Routed

`server/routed/capacity.mjs` retains Routed's `lib/agent/capacity.ts` algorithm with TypeScript types removed. Its full MIT notice is also retained in `server/routed/LICENSE`. The Houselights wrapper `server/capacity-evidence.mjs` preserves source quotes and content digests, but requires an explicit documented choice when capacities conflict instead of applying the original majority/larger-value tie-break.

`server/intelligence.mjs`, `server/activation.mjs`, `server/venues.mjs` and `server/operations.mjs` implement route scheduling, local activation, room-fit, standards-compliant iCalendar line folding and an evidence-number guard adapted from the product approaches in the supplied `routed-main` reference archive. The implementation was rewritten for Houselights' saved-evidence model and official Qloo harness integration. Routed is distributed under the MIT License:

MIT License

Copyright (c) 2026 Rohan Borade

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Other supplied references

The supplied Alloy archive declares MIT but contains an unfilled copyright template. Houselights uses its report-scoped analysis pattern as product inspiration; no Alloy source was copied.

The supplied Scaena and GeoTaste archives do not expose a project-level license in the supplied roots. Houselights therefore implements its booking pipeline, analytics and geographic evidence model independently and does not copy their source code or assets.
