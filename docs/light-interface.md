# Light interface — 21 October 2026

The visual identity uses the owner's ivory (#F7F6F2), ink (#191919), purple
(#7357C8), lavender (#E9E3F8) and gray (#85858E). Secondary body copy uses a
slightly darker gray for readability. Light mode is explicit, including forms.
Fraunces headings, IBM Plex Sans body copy and IBM Plex Mono receipts are
self-hosted with OFL licenses.

The judge page, organizer workspace, Festival GM, Decision Room, evidence,
Gauntlet, portfolio, evaluation and private review page share the identity.
Supplied logo and music cutouts replace the five earlier illustrations/GIF.
Supplied photographs and posters fill the camera and record frames as decorative
artwork, not purported Houselights events. The Slate Studio empty state omits the
microphone. The public "Great nights. Defensible decisions." hero is unchanged.

Entrance and hover motion is brief. Decorative disc motion is opt-in, persists
locally, stops while the document is hidden, and respects reduced-motion settings.
All existing optimizer, provider, permissions, benchmark and approval behavior
is unchanged. New judge scroll links preserve the selected case hash.

Verification:
- 233 automated tests passed locally, including saved-run/export provenance,
  judge replay and protected release checks.
- Changed JavaScript syntax checks and CSS parsing passed.
- Desktop and 390px viewport browser checks cover judge budget replay, organizer
  example optimization, navigation, receipts, GM, portfolio and evaluation.
- Budget replay retained the €10,000 Berlin slate and marked the €12,500 saved
  LLM lineup as violating the lowered budget. No provider call was needed.

Production deployment verification is recorded separately in ignored artifacts.

> **Superseded (25 October 2026).** This document describes an earlier state and is kept for the record. For the current state see the shared design tokens and components in `public/site.css`.
