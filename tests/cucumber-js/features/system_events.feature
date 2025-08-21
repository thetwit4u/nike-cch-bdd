Feature: System Events driven scenario

  Scenario: Start via S3 and wait for first event
    Given I load scenario "_starter"
    When I start the scenario via "s3"
    Then I wait for a System Event matching jsonpath "$.correlationId == ${correlationId}" within 60 seconds

