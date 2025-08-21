## CCH BDD (System Events–driven)

1. Copy environment:
   - Copy `tests/cucumber-js/env.example` to `tests/cucumber-js/.local.env` and fill values (see top-level `cch-bdd/README.md`).
2. Install deps:
   - `npm install`
3. Run a scenario:
   - `npm run cucumber -- --tags @hitl`

This runner:
- Subscribes a temporary SQS queue to `SYSTEM_EVENTS_TOPIC_ARN`
- Automatically creates a temporary S3 bucket if `START_S3_BUCKET` is not set, uploads workflow definitions/consignments, and cleans up after the run
- Drives steps solely from System Events; starts via SQS (Phase 1)
