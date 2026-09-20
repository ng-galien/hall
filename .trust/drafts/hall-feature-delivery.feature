# language: en
@trust-dsl:1 @procedure:hall-feature-delivery @version:0.1.0
Feature: Review a Hall feature document and progressively deliver its requirements

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Read Hall requirements, Maket review and attention points; declare inline missions after approval. | Change production or implement before approval. |
    And one string "review document"
    And one string "feature title"
    And many string "requirement ids"
    And missions "implementation" declared by agent

  @scenario:document-ready
  Scenario: Check the living review document
    Then Check "Maket document matches the Hall requirements" runs Operation "hall.maket-document-readiness@0.1.0"
        on "review document" as Input "documentName"
        and materializes "feature title" from field "featureTitle"
        and materializes "requirement ids" from field "requirementIds"
        and must establish "the document is accessible and presents the exact current requirements, architecture tasks, and prototype"
      """js
      (fact.documentName === context["review document"] || fail("Maket returned a different document")) &&
      (fact.status === "ready" || fail(`The review document is incomplete: ${fact.report}`))
      """

  @scenario:review-approved
  Scenario: Observe the user's review decision
    Given scenario "document-ready" is validated
    Then Check "Review decision is approval" runs Operation "hall.maket-document-readiness@0.1.0"
        on "review document" as Input "documentName"
        and must establish "the reviewed document is approved for this feature scope"
      """js
      (fact.status === "ready" || fail(`The review document changed or is incomplete: ${fact.report}`)) &&
      (fact.reviewDecision === "approved" || fail(`The review decision is ${fact.reviewDecision}`))
      """

  @scenario:implementation
  Scenario: Run declared implementation missions
    Given scenario "review-approved" is validated
    Then Invocation "deliver-and-verify" runs each declared Procedure in "implementation"
        and must establish "every declared implementation mission is verified"
