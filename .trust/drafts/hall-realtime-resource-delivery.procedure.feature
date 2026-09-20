@trust-dsl:1 @procedure:hall-realtime-resource-delivery @version:0.1.0 @intent-chaining
Feature: Verify Hall text-resource realtime delivery

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Execute the documentary pgTAP group and one focused HTTP integration test on the disposable PostgreSQL database. | Touch production data or use an unrelated full browser suite as proof. |
    And one string "resource requirement" fixed as "HALL-FR-DOC-280"

  @scenario:resource
  Scenario: Verify committed resource changes and authorized history
    Then Check "Realtime resource implementation" runs Operation "hall.realtime-resource-verification@0.1.0" on "resource requirement" as Input "requirementId" and must establish "resource pgTAP and HTTP checks pass"
      """js
      (fact.scope === "resource" || fail("wrong delivery scope")) &&
      (fact.documentPgTap === "passed" || fail("documentary pgTAP failed")) &&
      (fact.httpPostgres === "passed" || fail("focused HTTP integration failed"))
      """
