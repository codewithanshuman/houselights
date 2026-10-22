# Demand Lab: evidence, model and limits

Demand Lab is the organizer-only path at `/demand.html`. It accepts a city, event date, venue capacity, ticket price, genre, competing-event count and up to 20 candidates. It combines these with an optional saved Houselights source run. Only a matching source city's rank, local and trend signals with saved Qloo receipts enter the cultural features. The service makes **zero new provider calls** during a plan. Fees, availability, genres, capacity, competition and price remain organizer inputs.

The exact booking search checks up to 25,000 combinations, covering 20 candidates and five slots (15,504 combinations). It enforces budget, slots, locks, exclusions, discovery minimum, availability and genre caps. A brief above that search limit is rejected rather than silently truncated. With no trained model, the selected feasible slate maximizes a declared **0–100 cultural scenario proxy**: 50 points for mean receipt-backed relative fit, 15 for local evidence, 10 for supported rising trends, 10 for genre breadth and 5 for shared cultural themes, minus up to 10 for measured aggregate pairwise overlap and 15 for missing rank coverage. These are editorial weights, not demand, probabilities or people. Qloo audience comparisons and shared tastes never become a claim about unique ticket buyers. An aggregate overlap fraction requires an organizer-supplied ticketing source reference and remains labeled as an observation.

Optional base sell-through and price elasticity values generate a buyer-assumption scenario at 80%, 90%, 100%, 110% and 120% of the entered price. The ±15 sell-through-point stress band is not a statistical prediction interval. Revenue and margin are arithmetic on the displayed paid-ticket assumption, ticket price, artist fees and entered fixed/variable costs. Without those assumptions or a trained model, paid-ticket, revenue and margin ranges are unavailable.

## Outcome collection

`POST /api/demand/plan` optionally saves the selected plan (`save: true`) before the event. It returns an immutable `forecastId`, original generated time, selected artists, feature vector, model mode and any predicted `ticketsSold` range. After the event, `POST /api/demand/outcomes` accepts the forecast ID, `paidTicketsSold`, one of `box_office_export`, `ticketing_report`, or `venue_settlement`, and a private source reference. The app checks that the event date has passed, sellable-capacity arithmetic, duplicates and timing. It records the pre-event point prediction, actual paid tickets sold and signed/absolute error if a model existed. This target does not measure physical entry or gate scans. The app does not inspect the external source document; the source reference is organizer-attested. Synthetic examples cannot train the production model.

`POST /api/demand/historical-events` accepts one archived event at a time. Example:

```json
{
  "brief": {"city":"London","eventDate":"2025-06-14","capacity":5000,"ticketPrice":45,"competitionCount":2},
  "lineup": [{"id":"artist-one"},{"id":"artist-two"}],
  "paidTicketsSold": 3472,
  "featureObservedAt":"2025-05-20T12:00:00Z",
  "sourceKind":"box_office_export",
  "sourceReference":"private-report-2025-06-14"
}
```

The feature observation timestamp must be before the event to qualify for training. A saved Qloo `sourceId` is optional and counts toward the Qloo comparison only if its city matches, it was created before the event, and every selected artist has a valid rank receipt. These timestamps and references are supplied or saved by the organizer, so a retrospective historical import is not independent proof that the features truly existed at the stated time. Raw customer information and personal ticket-buyer records are neither requested nor stored. The private outcome ledger is available at `GET /api/demand/outcomes`; model readiness and held-out results are available at `GET /api/demand/model`.

## When a numerical forecast is allowed

The first model is a fixed-regularization ridge regression on log-odds of sell-through. Inputs are logarithmic capacity and price, competing-event count, number of acts and city indicators where at least five training examples exist. The Qloo-augmented version adds mean relative rank utility, rank coverage and local-evidence fraction. No hyperparameters are selected on the final test period. At least **40 real, sourced, pre-event-feature records** are required. The earliest 60% of event dates train the model; the next 20% set the 90% residual interval; at least eight still-later events in the final 20% evaluate error and empirical coverage. All three periods must have distinct dates. The interval is an empirical range, not a guarantee under market shift. An unseen city widens the range by an additional, explicitly uncalibrated ten occupancy points and loses the nominal coverage label.

The Qloo ablation is paired: at least 40 events with complete, pre-event Qloo rank coverage under the **same fingerprinted candidate-pool protocol** must be available. Relative rank utility from different pools is not comparable. A no-Qloo model and a Qloo-augmented model are trained on **the same** early Qloo-covered rows, calibrated on the same middle rows and evaluated on **the same** final later events. The report gives both final-period mean absolute errors in occupancy fraction, interval widths, coverage and the signed MAE difference. It reports a negative result if Qloo does not help. A future plan can use the Qloo-augmented model only with the same protocol; otherwise it falls back to the baseline. The comparison is observational and cannot prove that Qloo caused ticket sales. Exact additive terms from the linear model explain each prediction in log-odds; SHAP is unnecessary for this first transparent model.

The supplied `HouseLights_Real_Event_Outcomes_Master.xlsx` and `houselights_verified_concerts.zip` have now been audited together. The workbook contains 40 publisher-reported rows. All 12 ZIP records overlap workbook IDs and match on event date, city, capacity and tickets sold. There are 35 single-show rows with paid-ticket counts and sellable capacity, four multi-show aggregates, and one row missing capacity. The source files contain no timestamped pre-event feature vectors: the feature-cutoff, competition, genre, marketing and gate-scan columns are empty. Reported ticket counts are paid tickets sold, **not gate scans**. The price bands were transcribed from post-event publications, and realized USD per ticket is derived from the outcome; neither is treated as a proven pre-event price input. The sample spans unlike venue sizes and markets and is skewed toward sold-out, prominent acts. It does not meet the 40-event training gate, and in fact **zero** rows meet the pre-event-feature gate. No paid-ticket forecast error, interval coverage, price elasticity or Qloo lift is claimed from these files.

The private source catalog stores these 40 rows outside the training ledger. `GET /api/demand/reported-outcomes` returns them to an organizer with their publisher URLs and exclusion classifications. The import is idempotent and rejects a duplicate source ID with changed values. Source references are transcriptions of Pollstar box-office tables and are not independently audited ticketing transactions. Sample entries were cross-checked against the [June 24, 2024 Pollstar issue](https://fliphtml5.com/zuaoq/ouho/062424.issue_digital/) and [January 13, 2025 Pollstar issue](https://fliphtml5.com/zuaoq/kdka/011325.issue_digital/); every row still needs original-page review before a claim of full verification or public redistribution. The raw workbook and private catalog are excluded from Git.

Reproduce the audit locally with Python 3 (standard library only), then import the private JSON into the selected `DATA_DIR`:

```powershell
python scripts/audit-demand-outcomes.py 'C:\Users\anshumanbahekar\Downloads\HouseLights_Real_Event_Outcomes_Master.xlsx' 'C:\Users\anshumanbahekar\Downloads\houselights_verified_concerts.zip' --output artifacts/demand-source-audit.json
npm run import:outcomes -- artifacts/demand-source-audit.json
```

To activate real numerical forecasting, collect **distinct events** with a saved prediction or independently timestamped pre-event price, lineup, capacity, competition and Qloo evidence, plus a later ticketing outcome. Forty such records are the minimum gate, not a guarantee of a useful model. The date-separated backtest and paired Qloo ablation must then run and be reported even when results are poor.

Once a model passes these gates, Demand Lab ranks feasible lineups by the **lower end of modeled operating margin**. When it has not, it ranks by the cultural proxy and explicitly withholds paid-ticket estimates unless the organizer supplies scenario assumptions. A popularity index without a provenance-backed sales outcome is not substituted for tickets sold. Likewise, fee quotes and availability must still be verified before a booking decision.

The current application uses Node.js and persistent SQLite on the existing free VM. Python/FastAPI, LightGBM or CatBoost, PostgreSQL, SHAP and Optuna would add deployment complexity before there are enough qualifying pre-event labels to estimate and validate their benefit. The transparent model and paired holdout provide a baseline against which a more complex service can be tested when those labels exist. No invented synthetic training data is deployed.
