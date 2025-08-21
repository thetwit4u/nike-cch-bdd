Feature: HITL error handling via System Events

  @hitl
  Scenario: Orchestrator HITL flow with simulated capability and HITL/exception service responses
    Given I load scenario "_external/hitl_error_handling_interactive"
    And I set workflow definition from local file "import_us_v1.1.2-simplified-errorhandling.yaml" with s3 dest "workflows/import_us_v1.1.2-simplified-errorhandling.yaml"
    And I upload consignment "consignment.json" to s3 dest "data/consignment-${correlationId}.json" and set its URI in context
    And I will inject the workflow definition URI into the initial command
    When I start the orchestrator scenario via "sqs"
    Then I wait for a System Event matching jsonpath "$.correlationId == ${correlationId}" within 60 seconds
    # Simulate capability request/response roundtrip: first ERROR to trigger HITL
    When I send ASYNC_RESP from fixture "Create_Filing_Packs_1.json"
    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Wait_For_HITL_Resolution'" within 60 seconds
    When I send EVENT_WAIT_RESP from fixture "Wait_For_HITL_Resolution.json"
    # After HITL resolution, the orchestrator retries the capability; simulate SUCCESS
    When I send ASYNC_RESP from fixture "Create_Filing_Packs_2.json"
    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'End_Workflow'" within 60 seconds
    # Validate the consignment content (unchanged) at the end of the workflow
    Then I fetch JSON from s3 URI in businessContext at path "$.businessContext.consignmentURI" and compare with fixture "consignment.json"

