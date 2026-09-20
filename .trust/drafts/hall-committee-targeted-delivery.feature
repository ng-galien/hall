# language: en
@trust-dsl:1 @procedure:hall-committee-targeted-delivery @version:0.1.0
Feature: Verify Hall committee-to-business delivery within the existing feature Plan

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Run only the committee-link HTTP, Siren, component and focused Playwright tests on disposable test resources; project observed results into the reviewed Maket document. | Run the full test suite; modify production data; change requirements, permissions or behavior merely to obtain a green verdict; treat a command starting as a passing result. |
    And one string "review document"

  @scenario:http-siren
  Scenario: HTTP and Siren delivery is observed
    Then Check "Committee-link HTTP and Siren targeted tests pass" runs Operation "hall.committee-http-targeted-delivery@0.1.0"
        on "review document" as Input "documentName"
        and must establish "the accepted committee-link HTTP and Siren contract passes targeted tests and its evidence is projected into the living document"
      """js
      (fact.requirementId === "HALL-FR-BUS-070" || fail("Another requirement was verified")) &&
      (fact.layer === "http" || fail("Another layer was verified")) &&
      (fact.projectionStatus === "passed" || fail(`Maket projection failed: ${fact.report}`)) &&
      (fact.resultStatus === "passed" || fail(`Targeted HTTP and Siren tests failed: ${fact.report}`))
      """

  @scenario:frontend
  Scenario: Frontend delivery is observed
    Then Check "Committee-link component and focused Playwright tests pass" runs Operation "hall.committee-frontend-targeted-delivery@0.1.0"
        on "review document" as Input "documentName"
        and must establish "the accepted committee-link component passes its tests and the focused Playwright scenario, with evidence projected into the living document"
      """js
      (fact.requirementId === "HALL-FR-BUS-070" || fail("Another requirement was verified")) &&
      (fact.layer === "frontend" || fail("Another layer was verified")) &&
      (fact.projectionStatus === "passed" || fail(`Maket projection failed: ${fact.report}`)) &&
      (fact.resultStatus === "passed" || fail(`Targeted frontend tests failed: ${fact.report}`))
      """
