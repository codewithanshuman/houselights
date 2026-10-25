# Houselights documentation

## Start here

- [README](../README.md): the lead, the four-step path, what is and isn't measured, and the reproduce commands.
- [Claims audit](claims-audit.md): every significant claim, its status, its limits and its reproduction.
- [Competition changelog](competition-changelog.md): what changed during the hackathon and every correction to our own claims.
- [Submission checklist](submission.md) and [Devpost draft](devpost-description.md).

## The product

- [Feature overview and configuration](feature-overview.md): the full product description and every environment setting.
- [Architecture and evidence model](architecture.md), [Operational API](api.md).
- [Autopilot](autopilot.md): research policy, strategies, stress tests, integrity and replay.
- [Organizer workspace](organizer-workspace.md).
- [Persistent research and decision proofs](persistent-research.md), [Qloo decision-proof protocol](qloo-experiment-protocol.md).

## Evidence and evaluation

- Results (generated, reproducible with `npm run verify:all`):
  - [evidence withdrawal](../results/autopilot-evaluation.md);
  - [optimizer vs Qloo top-k](../results/rank-vs-optimum.md);
  - [sensitivity](../results/sensitivity.md);
  - [shocks](../results/shocks.md);
  - [Qloo proof](../results/qloo-proof.md).
- [Evaluation protocol](evaluation-protocol.md), [independent review readiness](independent-review-readiness.md), [usability test kit](usability-test-kit.md), [reviewer invitation drafts](reviewer-invitation-drafts.md).
- [Recorded New York agent run](recorded-agent-run.md), [recorded-control replication](recorded-control-replication.md), [market coverage probes](market-coverage.md), [shock call budget](shock-call-budget.md).

## Operations and security

- [Deployment runbook](deployment.md), [shared Oracle host record](shared-oracle-host.md) (current deployments, backups, rollback), [free hosting](free-hosting.md), [Qloo key request](key-request.md).
- [Security](security.md): headers, rate limits, dependencies, secrets, accepted risks.

## Organizer tools (uncalibrated)

These private planning tools are not part of the judged Booking Desk, and their forecasts are not calibrated against real outcomes.

- [Demand Lab](demand-model.md), [Audience Twin](audience-twin.md).
- [Financial Risk Lab](financial-model.md): [validation](financial-validation.md) and [performance](financial-performance.md).
- [Festival GM source integration](theme-night-integration.md), [venue capacity evidence](venue-capacity-evidence.md), [advanced workflows](advanced-workflows.md), [Decision OS](decision-os.md).

## History (superseded, kept for the record)

| Document | Superseded by |
|---|---|
| [Drawbacks audit response](drawbacks-audit-response.md) (24 Oct) | [Claims audit](claims-audit.md) |
| [Qloo proof report](qloo-proof-report.md) | [Claims audit](claims-audit.md) and [results](../results/qloo-proof.md) |
| [Autopilot 2.0 milestone report](autopilot-2-report.md) | [Autopilot](autopilot.md) and [claims audit](claims-audit.md) |
| [Judge demo path](judge-demo.md), [judge workspace](judge-workspace.md), [flagship booking experience](flagship-booking-experience.md) | The four-step Booking Desk in the [README](../README.md) |
| [Light interface](light-interface.md) (21 Oct) | The shared design tokens in `public/site.css` |
| [Live validation](live-validation.md) (20 Oct) | [Shared Oracle host record](shared-oracle-host.md) |
| [Archive capability status](archive-capability-status.md), [archive gap audit](archive-gap-audit.md), [reference feature audit](reference-feature-audit.md), [PartDrop integration](partdrop-integration.md) | Records of source-code provenance; still accurate as history |
