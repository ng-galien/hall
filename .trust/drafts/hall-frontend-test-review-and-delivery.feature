# language: en
@trust-dsl:1 @procedure:hall-frontend-test-review-and-delivery @version:0.2.0
Feature: Review the frontend against the prior Siren contract and retain planned tests separately from delivery

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Read the Hall requirement, Maket document, prior SQL and HTTP/Siren reviews and current frontend code; assess whether the planned Siren representation and actions are sufficient for the agreed UI; record sourced component findings and planned proofs; return a precise planned-contract gap to the upstream review; declare later delivery missions. | Treat backend code not yet written as a design gap; reopen an upstream decision; invent backend commands, permissions or frontend authorization rules; change the feature behavior; treat planned tests as executed or design review as delivery. |
    And one string "review document"
    And one string "finding ids csv"
    And one string "findings snapshot"
    And missions "delivery" declared by agent

  @scenario:findings
  Scenario: Record frontend findings grounded in upstream contracts
    Then Check "Frontend and test findings are recorded in Maket" runs Operation "hall.maket-frontend-test-review@0.1.0"
        on "review document" as Input "documentName"
        and materializes "finding ids csv" from field "findingIdsCsv"
        and materializes "findings snapshot" from field "reviewSnapshotJson"
        and must establish "the review reads prior decisions and names separate proof layers"
      """js
      (fact.documentName === context["review document"] || fail("Maket returned another document")) &&
      (fact.structureStatus === "valid" || fail(`The frontend review is incomplete: ${fact.report}`)) &&
      (fact.findingIdsCsv.length > 0 || fail("No frontend finding is recorded")) &&
      (fact.proofLayersCsv.includes("Playwright") || fail("The end-to-end proof is not planned"))
      """

  @scenario:escalations
  Scenario: Surface genuine conflicts without reopening prior decisions
    Given scenario "findings" is validated
    Then Check "Frontend contract conflicts are resolved or escalated" runs Operation "hall.maket-frontend-test-review@0.1.0"
        on "review document" as Input "documentName"
        and must establish "no newly found functional contradiction is silently passed to delivery"
      """js
      (fact.documentName === context["review document"] || fail("Maket returned another document")) &&
      (fact.structureStatus === "valid" || fail(`The frontend review is incomplete: ${fact.report}`)) &&
      (fact.findingIdsCsv === context["finding ids csv"] || fail("The finding set changed since the first Check")) &&
      (fact.escalationCount === 0 || fail(`Functional decision required from the user: ${fact.escalationIdsCsv}`))
      """

  @scenario:delivery
  Scenario: Verify separately declared component and test delivery work
    Given scenario "escalations" is validated
    Then Invocation "deliver-frontend-and-tests" runs each declared Procedure in "delivery"
        and must establish "every declared component and test delivery mission is verified"
