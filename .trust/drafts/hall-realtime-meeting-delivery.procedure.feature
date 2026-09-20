@trust-dsl:1 @procedure:hall-realtime-meeting-delivery @version:0.1.0 @intent-chaining
Feature: Verify Hall live meeting conduct delivery

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Verify the approved meeting event transport with the focused contract build, server typing and server tests. | Change meeting business rules or run the full browser suite. |
    And one string "meeting requirement" fixed as "HALL-FR-MTG-320"

  @scenario:meeting
  Scenario: Verify meeting events and read-only subscribers
    Then Check "Realtime meeting implementation" runs Operation "hall.realtime-meeting-verification@0.2.0" on "meeting requirement" as Input "requirementId" and must establish "the meeting transport and publication checks pass"
      """js
      (context["meeting requirement"] === "HALL-FR-MTG-320" || fail("wrong requirement")) &&
      (fact.scope === "meeting" || fail("wrong delivery scope")) &&
      (fact.contractBuild === "passed" || fail("contract build failed")) &&
      (fact.serverTypecheck === "passed" || fail("server typing failed")) &&
      (fact.focusedTests === "passed" || fail("focused meeting tests failed"))
      """
