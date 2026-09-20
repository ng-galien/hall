# language: en
@trust-dsl:1 @procedure:hall-design-review-and-delivery @version:0.1.0
Feature: Record design findings and arbitrations before delivering a Hall feature

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Read and update the assigned Maket feature document; record review findings and decisions; declare later delivery missions. | Change the Hall schema or claim implementation from the design review alone. |
    And one string "review document"
    And many string "finding ids"
    And one string "findings snapshot"
    And many string "arbitrated finding ids"
    And one string "arbitrations snapshot"
    And missions "delivery" declared by agent

  @scenario:findings
  Scenario: Record design-review findings
    Then Check "Design findings are recorded in Maket" runs Operation "hall.maket-design-review@0.1.0"
        on "review document" as Input "documentName"
        and materializes "finding ids" from field "findingIds"
        and materializes "findings snapshot" from field "reviewSnapshotJson"
        and must establish "each design finding has an identified observation and ambiguity in the living document"
      """js
      (fact.documentName === context["review document"] || fail("Maket returned another document")) &&
      (fact.structureStatus === "valid" || fail(`The design review has missing fields: ${fact.report}`)) &&
      (fact.findingIds.length > 0 || fail("No design finding is recorded"))
      """

  @scenario:arbitrations
  Scenario: Record the resolution of every finding
    Given scenario "findings" is validated
    Then Check "Design arbitrations are recorded in Maket" runs Operation "hall.maket-design-review@0.1.0"
        on "review document" as Input "documentName"
        and materializes "arbitrated finding ids" from field "resolvedIds"
        and materializes "arbitrations snapshot" from field "reviewSnapshotJson"
        and must establish "every recorded ambiguity has an explicit arbitration in the living document"
      """js
      (fact.documentName === context["review document"] || fail("Maket returned another document")) &&
      (fact.structureStatus === "valid" || fail(`The design review has missing fields: ${fact.report}`)) &&
      (fact.openCount === 0 || fail("Some design findings remain unresolved")) &&
      (fact.reviewSnapshotJson === context["findings snapshot"] || fail("The design review changed since the first Check")) &&
      (fact.resolvedIds.length === context["finding ids"].length || fail("A design finding has no recorded arbitration"))
      """

  @scenario:delivery
  Scenario: Verify separately declared delivery work
    Given scenario "arbitrations" is validated
    Then Invocation "deliver-feature" runs each declared Procedure in "delivery"
        and must establish "every declared delivery mission is verified"
