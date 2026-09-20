@trust-dsl:1 @procedure:hall-municipality-review-projection @version:0.1.0 @intent-chaining
Feature: Verify source-driven municipality clarification document synchronization
  The three domain clarifications remain unchanged. This documentation mission observes
  source equality and saved revision only; it does not approve or verify their reasoning.
  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Read the requirement and three completed agent reports; initialize or update only source-owned Maket document state using optimistic revision; reread saved values; write the projection receipt. | Change product decisions, human-owned state, catalogue, code, model, business data, or other documents; infer report correctness or product approval; commit, push or deploy. |
    And one string "document"
    And one string "clarification report" returned
  @scenario:synchronize
  Scenario: Record the source-driven document projection
    Then Check "synchronize clarification document" runs Operation "hall.municipality-review-projection@0.1.0"
      on "document" as Input "documentName"
      and materializes "clarification report" from field "report"
      and must establish "the three reports, gaps, tensions and canonical requirement are reread identically from a saved Maket revision"
      """js
      fact.documentName === context.document && fact.revision > 0 && fact.reportCount === 3 && fact.sourceMatch === "yes" && fact.catalogueDigest !== "" || fail("The saved document must match the canonical requirement and all three reports")
      """
