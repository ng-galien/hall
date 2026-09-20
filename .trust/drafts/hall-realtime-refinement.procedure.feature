@trust-dsl:1 @procedure:hall-realtime-refinement @version:0.1.0 @intent-chaining
Feature: Record a sourced architectural review for Hall live updates

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Read the assigned agent review and verify its referenced source files for the approved Hall live-update scope. | Modify product rules, schema, production data, or count review findings as implementation evidence. |
    And one string "report file"
    And one string "review scope"
    And many string "findings" returned

  @scenario:review
  Scenario: Record the review and its open decisions
    Then Check "Sourced architectural review" runs Operation "hall.realtime-review-report@0.1.0" on "report file" as Input "reportFile" using "review scope" as Input "expectedScope" and materializes "findings" from field "findings" and must establish "the assigned review has source references and no unresolved product decision"
      """js
      (fact.scope === context["review scope"] || fail("another scope was reviewed")) &&
      (fact.findings.length > 0 || fail("review findings are empty")) &&
      (fact.evidencePaths.length > 0 || fail("review has no source references")) &&
      (fact.decisionStatus === "clear" || fail("product decisions need resolution"))
      """
