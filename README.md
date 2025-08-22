## CCH BDD: System Events–driven E2E Test Harness (Cucumber.js)

This project contains a Node.js (TypeScript) Cucumber harness to run end-to-end tests by:
- Starting scenarios via SQS (Phase 1), with planned S3-start support (Phase 2)
- Subscribing a temporary SQS queue to the CCH System Events SNS topic
- Reacting to System Events to drive the scenario forward
- Sending orchestrator intermediate commands (ASYNC_RESP, EVENT_WAIT_RESP) when services are stubbed
- Validating S3 JSON payloads referenced by System Events

### Contents
- `tests/cucumber-js/` – features, step definitions, and support utilities
  - `features/` – Gherkin features (e.g., `hitl_error_handling.feature`)
  - `step-definitions/` – start, system event waits, orchestrator responses, workflow definition upload
  - `support/` – AWS clients, SNS→SQS subscription, polling, interpolation, S3, validators
  - `scenarios/` – scenario fixtures (`initial.json`, `*.json` stubs, optional expected JSON)

### Prerequisites
- Node.js 18+
- AWS credentials with permissions to:
  - Create/Delete SQS queues, Subscribe/Unsubscribe to SNS
  - Send SQS messages to the orchestrator command queue
  - Put/Get objects to the definitions/data S3 bucket(s)

### Install
From the repository root:

```bash
cd tests/cucumber-js
npm install
```

### Configure environment
Create `tests/cucumber-js/.local.env` with at least (auto-creation options explained below):

```env
AWS_REGION=eu-west-1
# Optionally rely on your default AWS credentials provider chain or set a profile in your shell

# Orchestrator command queue (SQS URL)
COMMAND_QUEUE_URL=...

# CCH System Events SNS topic (to subscribe a temp queue during tests)
SYSTEM_EVENTS_TOPIC_ARN=...

# S3 bucket used to upload workflow definitions and consignment data
# If not set, the harness will automatically create a temporary bucket
# and delete it at the end of the run
# START_S3_BUCKET=...
START_S3_KEY_PREFIX=workflows/

# Tag for correlation naming and interpolation
TEST_USER=dave

# Optional: default timeouts
SCENARIO_TIMEOUT_SECONDS=120
```

Note: A `.env.example` file is recommended for teams; copy to `.local.env` and fill in values.

### Running the HITL error handling scenario (first version)
1) Prepare fixtures
- Create the folder `tests/cucumber-js/scenarios/_external/hitl_error_handling_interactive/` (already committed with base fixtures).
- Ensure the workflow definition YAML (e.g., `import_us_v1.1.2-simplified-errorhandling.yaml`) is present.
- Review `initial.json`, `consignment.json`, `Create_Filing_Packs_1.json`, `Wait_For_HITL_Resolution.json`, and `Create_Filing_Packs_2.json` fixtures. The flow is:
  - Start orchestrator via SQS using `initial.json` (with `${ctx:consignmentUri}` interpolated)
  - Send ERROR `ASYNC_RESP` (Create_Filing_Packs_1.json) to trigger HITL
  - Send `EVENT_WAIT_RESP` (Wait_For_HITL_Resolution.json)
  - Send SUCCESS `ASYNC_RESP` (Create_Filing_Packs_2.json)
  - Validate consignment S3 JSON equals fixture `consignment.json` at the end

```json
{
  "workflowDefinitionURI": "${ctx:workflowDefinitionUri}",
  "workflowInstanceId": "${workflowInstanceId}",
  "correlationId": "${correlationId}",
  "command": {
    "type": "EVENT",
    "id": "${uuid}",
    "source": "BDD-HITL",
    "timestamp": "${now}",
    "payload": {
      "consignmentId": "CNS-EXAMPLE",
      "consignmentURI": "s3://your-data-bucket/path/to/consignment.json",
      "_no_cache": true
    }
  }
}
```

- Add an `EVENT_WAIT_RESP` payload to resume the HITL pause, e.g., `Wait_For_HITL_Resolution.json`:

```json
{
  "workflowDefinitionURI": "${ctx:workflowDefinitionUri}",
  "workflowInstanceId": "${workflowInstanceId}",
  "correlationId": "${correlationId}",
  "command": {
    "type": "EVENT_WAIT_RESP",
    "id": "${uuid}",
    "source": "MockCapabilityService",
    "timestamp": "${now}",
    "status": "SUCCESS",
    "payload": { "resolution": "RESOLVED" }
  }
}
```

2) Run the feature

```bash
cd tests/cucumber-js
npm run cucumber -- --tags @hitl
```

The feature `features/hitl_error_handling.feature` will:
- Automatically ensure an S3 bucket exists (auto-create a temp bucket if `START_S3_BUCKET` is unset)
- Upload the workflow definition to `s3://${START_S3_BUCKET}/workflows/...`
- Upload `consignment.json` and inject its S3 URI into the initial command
- Start the orchestrator via SQS
- Send simulated capability `ASYNC_RESP` messages to drive HITL ERROR → RESUME → SUCCESS
- Validate the final consignment S3 payload matches `consignment.json`

### Visual output options

#### Terminal UI (progress bar)
Use Cucumber's progress bar and a concise summary:

```bash
npm run cucumber -- --format progress-bar --format summary --tags @hitl
```

#### Local HTML report (official formatter)
Generate a pretty HTML report locally:

```bash
npm install -D @cucumber/html-formatter
npm run cucumber -- --format @cucumber/html-formatter:reports/cucumber.html --tags @hitl
open reports/cucumber.html
```

You can combine formatters (e.g., progress bar + HTML):

```bash
npm run cucumber -- \
  --format progress-bar \
  --format @cucumber/html-formatter:reports/cucumber.html
```

#### Pretty console formatter (official)
Readable step-by-step console output:

```bash
# via npm script
npm run cucumber:ui -- --tags @hitl

# or directly
npm run cucumber -- --format @cucumber/pretty-formatter --tags @hitl
```

Tip: for best rendering, run in a real terminal (Terminal/iTerm) rather than an IDE panel.

### Authoring scenarios
- Create a folder under `tests/cucumber-js/scenarios/<name>/` with:
  - `initial.json` – first message (full envelope) to send to `COMMAND_QUEUE_URL`
  - `*.json` – optional subsequent envelopes for `ASYNC_RESP`/`EVENT_WAIT_RESP`
  - `expected/*.json` – optional expected S3 JSON to compare against
- Use interpolation placeholders in fixtures:
  - `${uuid}`, `${now}`, `${user}`, `${correlationId}`, `${workflowInstanceId}`, `${businessKey}`
  - `${env:VAR_NAME}` for environment variables
  - `${ctx:...}` for values previously set in context (e.g., workflow definition URI)

### Automatic S3 bucket management
- If `START_S3_BUCKET` is not set, the harness creates a temporary bucket named `cch-bdd-${TEST_USER}-${Date.now()}` (lowercased) at startup, uses it for uploads, and deletes it (after emptying) when tests finish.
- For `us-east-1`, bucket creation uses the region-specific API variant automatically.
- Required IAM permissions: s3:CreateBucket, s3:PutObject, s3:GetObject, s3:ListBucket, s3:DeleteObject, s3:DeleteBucket.

### Troubleshooting
- Ensure `COMMAND_QUEUE_URL` and `SYSTEM_EVENTS_TOPIC_ARN` are correct for your environment.
- Verify AWS credentials can create SQS queues and subscribe to the SNS topic.
- If events do not appear, confirm the SNS topic is allowed to publish to the temporary queue (policy is applied automatically by the harness).
- For FIFO queues, the harness sets `MessageGroupId` and `MessageDeduplicationId` automatically.

### Notes
- Phase 1 supports SQS start. S3 start will be added in Phase 2.
- System Event validation uses the schema at `tests/cucumber-js/cch-system-event.schema.json`.


