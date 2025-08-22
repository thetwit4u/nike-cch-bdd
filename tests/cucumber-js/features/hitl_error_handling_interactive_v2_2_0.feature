Feature: HITL Error Handling Interactive v2.2.0 (full mocked flow)

  @orchestrator @hitl @flow_full @v2_2_0 @mocked @regression
  Scenario: Orchestrator full flow with mocked capability and HITL interactions
    Given I load scenario "_external/hitl_error_handling_interactive_v2.2.0"
    And I set workflow definition from local file "import_us_v2.2.0-simplified-errorhandling.yaml" with s3 dest "workflows/import_us_v2.2.0-simplified-errorhandling.yaml"
    And I upload consignment "consignment.json" to s3 dest "data/consignment-${correlationId}.json" and set its URI in context
    When I start the orchestrator scenario via "sqs"

    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Enrich_Consignment'" within 60 seconds
    When I send ASYNC_RESP from fixture "Enrich_Consignment_ERROR.json"
    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Wait_Enrich_Exception_Resolution'" within 60 seconds
    When I send EVENT_WAIT_RESP from fixture "Wait_Enrich_Exception_Resolution.json"

    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Enrich_Consignment'" within 60 seconds
    When I send ASYNC_RESP from fixture "Enrich_Consignment_SUCCESS.json"

    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Create_Filing_Packs'" within 60 seconds
    When I send ASYNC_RESP from fixture "Create_Filing_Packs_SUCCESS.json"

    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Submit_Import_Filing'" within 60 seconds
    When I send ASYNC_RESP from fixture "Submit_Import_Filing_packA_SUCCESS.json"
    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Wait_For_Custom_Status_Update'" within 60 seconds
    When I send EVENT_WAIT_RESP from fixture "Wait_For_Custom_Status_Update_packA_1.json"
    When I send EVENT_WAIT_RESP from fixture "Wait_For_Custom_Status_Update_packA_2.json"
    When I send EVENT_WAIT_RESP from fixture "Wait_For_Custom_Status_Update_packA_RELEASED.json"

    When I send ASYNC_RESP from fixture "Submit_Import_Filing_packB_SUCCESS.json"
    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Wait_For_Custom_Status_Update'" within 60 seconds
    When I send EVENT_WAIT_RESP from fixture "Wait_For_Custom_Status_Update_packB_1.json"
    When I send EVENT_WAIT_RESP from fixture "Wait_For_Custom_Status_Update_packB_RELEASED.json"

    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'End_Workflow'" within 90 seconds
    And I fetch JSON from s3 URI in businessContext at path "$.businessContext.consignmentURI" and compare with fixture "consignment.json"
