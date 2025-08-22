# TASKS

## 2025-08-22
- Add BDD scenario for HITL Error Handling Interactive v2.2.0 (full mocked flow)
  - Location: `tests/cucumber-js/features/hitl_error_handling_interactive_v2_2_0.feature`
  - Scenario fixtures under: `tests/cucumber-js/scenarios/_external/hitl_error_handling_interactive_v2.2.0/`
  - Uses `samples/20584015094_consignment.json` as base with interpolation
  - Mocks all capability/event_wait interactions through End_Workflow

### Discovered During Work
- Ensure `routingHint.branchKey` is present on branch-specific ASYNC_RESP and EVENT_WAIT_RESP fixtures.
 - Adopt tagging scheme: `@orchestrator @hitl @flow_simple|@flow_full @vX_Y_Z @mocked @smoke|@regression`.
