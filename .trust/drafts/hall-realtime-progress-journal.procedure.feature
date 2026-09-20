@trust-dsl:1 @procedure:hall-realtime-progress-journal @version:0.1.0 @intent-chaining
Feature: Keep the Hall realtime Maket journal tied to the observed TRUST Plan

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Read the current Hall realtime Plan and source review reports, and update the Maket progress journal with observed states. | Mark delivery tests successful without executing them or alter product requirements. |
    And one string "plan name"
    And one string "document name"
    And one string "journal revision" returned

  @scenario:journal
  Scenario: Project the validated reviews into the living document
    Then Check "Maket journal reflects TRUST reviews" runs Operation "hall.realtime-progress-sync@0.1.0" on "plan name" as Input "planName" using "document name" as Input "documentName" and materializes "journal revision" from field "documentRevision" and must establish "the journal cites the observed review Checks"
      """js
      (fact.planName === context["plan name"] || fail("another Plan was read")) &&
      (fact.reviewStatus === "validated" || fail("document review is not validated")) &&
      (fact.childCount === 3 || fail("the three delegated reviews are not all validated")) &&
      (fact.documentPage === "journal-page-6" || fail("journal page was not updated")) &&
      (fact.documentRevision.length > 0 || fail("Maket revision is missing"))
      """
