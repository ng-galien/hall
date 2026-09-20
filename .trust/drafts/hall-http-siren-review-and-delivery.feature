# language: en
@trust-dsl:1 @procedure:hall-http-siren-review-and-delivery @version:0.1.0
Feature: Record HTTP and Siren findings and escalate unresolved functional conflicts before delivery

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Inspect Hall HTTP and Siren contracts; read and update the assigned Maket document; record findings and the user's decisions; declare later delivery missions. | Change the Hall schema or application behavior; invent a business permission decision; claim delivery from a design review. |
    And one string "review document"
    And one string "finding ids csv"
    And one string "findings snapshot"
    And missions "delivery" declared by agent

  @scenario:findings
  Scenario: Record HTTP and Siren findings
    Then Check "HTTP and Siren findings are recorded in Maket" runs Operation "hall.maket-http-siren-review@0.1.0"
        on "review document" as Input "documentName"
        and materializes "finding ids csv" from field "findingIdsCsv"
        and materializes "findings snapshot" from field "reviewSnapshotJson"
        and must establish "the living document records sourced contract findings and explicit questions"
      """js
      (fact.documentName === context["review document"] || fail("Maket returned another document")) &&
      (fact.structureStatus === "valid" || fail(`The HTTP and Siren review has missing fields: ${fact.report}`)) &&
      (fact.findingIdsCsv.length > 0 || fail("No HTTP or Siren finding is recorded"))
      """

  @scenario:escalations
  Scenario: Resolve or escalate functional contradictions
    Given scenario "findings" is validated
    Then Check "HTTP and Siren functional conflicts are resolved or escalated" runs Operation "hall.maket-http-siren-review@0.1.0"
        on "review document" as Input "documentName"
        and must establish "no question marked for the user remains unanswered before delivery"
      """js
      (fact.documentName === context["review document"] || fail("Maket returned another document")) &&
      (fact.structureStatus === "valid" || fail(`The HTTP and Siren review has missing fields: ${fact.report}`)) &&
      (fact.findingIdsCsv === context["finding ids csv"] || fail("The finding set changed since the first Check")) &&
      (fact.escalationCount === 0 || fail(`Functional decision required from the user: ${fact.escalationIdsCsv}`))
      """

  @scenario:delivery
  Scenario: Verify separately declared HTTP and Siren delivery work
    Given scenario "escalations" is validated
    Then Invocation "deliver-http-siren" runs each declared Procedure in "delivery"
        and must establish "every declared HTTP and Siren delivery mission is verified"
