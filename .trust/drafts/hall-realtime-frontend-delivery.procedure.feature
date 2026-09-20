@trust-dsl:1 @procedure:hall-realtime-frontend-delivery @version:0.1.0 @intent-chaining
Feature: Deliver the Hall realtime interface with the frontend design skill

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Verify the approved Hall realtime interface, its recorded frontend design skill, typing and focused component tests. | Invent UI permissions, alter product decisions or run the full Playwright suite. |
    And one string "required skill" fixed as "frontend-skill"
    And one string "delivery report"

  @scenario:frontend
  Scenario: Verify the interface and its design method
    Then Check "Realtime frontend implementation and skill" runs Operation "hall.realtime-frontend-verification@0.1.0" on "required skill" as Input "requiredSkill" using "delivery report" as Input "reportFile" and must establish "the UI uses the declared skill and targeted checks pass"
      """js
      (fact.scope === "frontend" || fail("another delivery scope was checked")) &&
      (fact.skill === context["required skill"] || fail("frontend skill was not recorded")) &&
      (fact.skillApplicationCount > 0 || fail("no skill decision was applied")) &&
      (fact.fileCount > 0 || fail("no frontend file was recorded")) &&
      (fact.typecheck === "passed" || fail("frontend typing failed")) &&
      (fact.componentTests === "passed" || fail("focused component tests failed"))
      """
