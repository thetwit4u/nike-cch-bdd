Feature: Controller ASN start → Orchestrator HITL flow v2.2.0 (mocked)

  @orchestrator @controller @asn @hitl @flow_full @v2_2_0 @mocked @regression
  Scenario: Flow Controller starts orchestrator from ASN; validate deliveries only
    Given I load scenario "_external/controller_asn_start_v2.2.0"
    When I start the controller scenario via "sqs"

    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Enrich_Consignment'" within 60 seconds
    And I sync correlation and instance from last System Event
    # Optional: correlation contains the injected UUID captured at controller start
    Then I wait for a System Event matching jsonpath "$.correlationId contains ${ctx:captures.controllerStartUuid}" within 60 seconds

    When I send ASYNC_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Enrich_Consignment_ERROR.json"
    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Wait_Enrich_Exception_Resolution'" within 60 seconds
    When I send EVENT_WAIT_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Wait_Enrich_Exception_Resolution.json"

    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Enrich_Consignment'" within 60 seconds
    When I send ASYNC_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Enrich_Consignment_SUCCESS.json"

    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Create_Filing_Packs'" within 60 seconds
    When I send ASYNC_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Create_Filing_Packs_SUCCESS.json"

    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Submit_Import_Filing'" within 60 seconds
    When I send ASYNC_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Submit_Import_Filing_packA_SUCCESS.json"
    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Wait_For_Custom_Status_Update'" within 60 seconds
    When I send EVENT_WAIT_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Wait_For_Custom_Status_Update_packA_1.json"
    When I send EVENT_WAIT_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Wait_For_Custom_Status_Update_packA_2.json"
    When I send EVENT_WAIT_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Wait_For_Custom_Status_Update_packA_RELEASED.json"

    When I send ASYNC_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Submit_Import_Filing_packB_SUCCESS.json"
    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'Wait_For_Custom_Status_Update'" within 60 seconds
    When I send EVENT_WAIT_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Wait_For_Custom_Status_Update_packB_1.json"
    When I send EVENT_WAIT_RESP from fixture "../hitl_error_handling_interactive_v2.2.0/Wait_For_Custom_Status_Update_packB_RELEASED.json"

    Then I wait for a System Event matching jsonpath "$.transition.currentStep.name == 'End_Workflow'" within 90 seconds

    Then I fetch JSON from s3 URI in businessContext at path "$.businessContext.consignmentURI" and compare JSON at path "$.consignment.shipments[0].deliveries" with fixture "../../samples/20584015094_consignment.json" at path "$.consignment.shipments[0].deliveries"


