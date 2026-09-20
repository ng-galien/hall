@trust-dsl:1 @procedure:hall-realtime-delivery @version:0.2.0 @intent-chaining
Feature: Refine and deliver Hall live updates with observed evidence

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Review the Hall live-update scope, then implement and verify only the approved requirements in inline missions. | Implement an undecided product rule, change production data, or count a review as delivery. |
    And one string "review document"
    And one string "meeting requirement"
    And one string "resource requirement"
    And many string "review findings"
    And missions "refinement" declared by agent
    And missions "delivery" declared by agent

  @scenario:review
  Scenario: Observe the user's scope decision
    Then Check "Reviewed document and catalogue are aligned" runs Operation "hall.realtime-document-review@0.2.0" on "review document" as Input "documentName" and must establish "the reviewed requirements are approved and registered"
      """js
      (fact.documentName === context["review document"] || fail("another document was read")) &&
      (fact.reviewDecision === "approved" || fail("scope review is still pending")) &&
      (fact.reviewCommentPresent === "yes" || fail("review comment is missing")) &&
      (fact.catalogueAligned === "yes" || fail("catalogue differs from the reviewed document")) &&
      (fact.requirementIds.includes(context["meeting requirement"]) || fail("meeting requirement is missing")) &&
      (fact.requirementIds.includes(context["resource requirement"]) || fail("resource requirement is missing"))
      """

  @scenario:refinement
  Scenario: Refine the reviewed scope through delegated reviews
    Given scenario "review" is validated
    Then Invocation "refine" runs each declared Procedure in "refinement" and materializes "review findings" from Result "findings" and must establish "the delegated reviews are validated"

  @scenario:delivery
  Scenario: Deliver only the reviewed scope
    Given scenario "refinement" is validated
    Then Invocation "deliver" runs each declared Procedure in "delivery" and must establish "all declared delivery missions are verified"
