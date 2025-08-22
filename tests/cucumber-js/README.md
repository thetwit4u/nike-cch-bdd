## CCH BDD (System Events–driven)

This harness starts a flow (orchestrator via SQS; controller via S3/SQS), subscribes a temporary SQS queue to the System Events topic, and advances solely based on System Events.

### Configure
1) Create `tests/cucumber-js/.local.env` with:
- `AWS_REGION` (eu-west-1)
- `COMMAND_QUEUE_URL` (URL or ARN) [required]
- `SYSTEM_EVENTS_TOPIC_ARN` [required]
- `START_S3_BUCKET` (optional; temp bucket created if missing)
- `START_S3_KEY_PREFIX` (default: `workflows/`)
- `TEST_USER`
- `SYSTEM_EVENT_SCHEMA_MODE` (`warn` or `strict`)

2) Install deps
```
npm install
```

### Run
- By tag:
```
npm run cucumber -- --tags @hitl
```
- By scenario folder:
```
npm run cucumber -- --scenario tests/cucumber-js/scenarios/_starter --user $USER
```

### Core steps
- Start orchestrator (SQS only): `When I start the orchestrator scenario via "sqs"`
- Upload workflow definition: `And I set workflow definition from local file "...yaml" with s3 dest "workflows/...yaml"`
- Upload consignment & set URI: `And I upload consignment "consignment.json" to s3 dest "data/consignment-${correlationId}.json" and set its URI in context`
- Wait for System Event: `Then I wait for a System Event matching jsonpath "$.correlationId == ${correlationId}" within 60 seconds`
- Send stub responses: `When I send ASYNC_RESP from fixture "...json"`, `When I send EVENT_WAIT_RESP from fixture "...json"`
- Compare full S3 JSON: `Then I fetch JSON from s3 URI in businessContext at path "$.businessContext.consignmentURI" and compare with fixture "consignment.json"`

### Partial comparisons (subset validation)
Compare only parts of a JSON payload using JSONPath on both actual and expected data.

- Compare a subset of a fetched S3 JSON against a subset of a fixture:
```
Then I fetch JSON from s3 URI in businessContext at path "<uriJsonPath>" and compare JSON at path "<jsonPath>" with fixture "<fixture>" at path "<fixturePath>"
```
Example:
```
Then I fetch JSON from s3 URI in businessContext at path "$.businessContext.consignmentURI" \
  and compare JSON at path "$.consignment.consignmentId" with fixture "consignment.json" at path "$.consignment.consignmentId"
```

- Compare a subset of the System Event directly:
```
Then I compare event JSON at path "<eventPath>" with fixture "<fixture>" at path "<fixturePath>"
```

These steps allow validating only the fields relevant to the scenario without asserting the entire object shape.

### Tagging and best practices

Use consistent tags to scope runs and convey intent:

- Component: `@orchestrator`
- Category: `@hitl`
- Flow scope: `@flow_simple` or `@flow_full`
- Version: `@v1_1_2`, `@v2_2_0`, etc.
- Mocking/suite: `@mocked` plus `@smoke` (simple) or `@regression` (full)

Examples:

- Simple HITL flow (v1.1.2): `@orchestrator @hitl @flow_simple @v1_1_2 @mocked @smoke`
- Full HITL flow (v2.2.0): `@orchestrator @hitl @flow_full @v2_2_0 @mocked @regression`

Filtering runs:

```
# Only orchestrator full flow
npm run cucumber -- --tags "@orchestrator and @flow_full"

# Only simple smoke
npm run cucumber -- --tags "@orchestrator and @flow_simple and @smoke"
```

When adding new features:

- Prefer small, focused scenarios per flow.
- Keep fixtures minimal; include only fields exercised by the workflow.
- Use interpolation tokens: `${uuid}`, `${now}`, `${correlationId}`, `${workflowInstanceId}`, `${env:*}`, `${ctx:*}`.
- Ensure branch routing in map flows via `command.routingHint.branchKey` on stubbed responses.
- Keep files under 500 lines and split helpers if growing.
