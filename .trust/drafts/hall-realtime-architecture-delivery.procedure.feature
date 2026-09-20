@trust-dsl:1 @procedure:hall-realtime-architecture-delivery @version:0.1.0 @intent-chaining
Feature: Verify architecture, requirements and taxonomy for Hall realtime delivery

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Execute Hall's requirements and architecture gates, read Code Moniker taxonomy and report executable coverage. | Weaken architectural rules, reclassify project vocabulary without a product decision or hide pre-existing taxonomy diagnostics. |
    And one string "requirement" fixed as "HALL-FR-MTG-320"

  @scenario:architecture
  Scenario: Observe the executable architecture gate and taxonomy
    Then Check "Realtime architecture and taxonomy" runs Operation "hall.realtime-architecture-verification@0.2.0" on "requirement" as Input "requirementId" and must establish "requirements, traceability and executable architecture pass with taxonomy debt reported"
      """js
      (fact.requirements === "passed" || fail("requirement gate failed")) &&
      (fact.architecture === "passed" || fail("architecture gate failed")) &&
      (fact.invalid === 0 || fail("invalid taxonomy entries were found")) &&
      (fact.violations === 0 || fail("Code Moniker violations were found")) &&
      (fact.zeroAntecedents === 0 || fail("an architectural implication has no observed antecedent")) &&
      (fact.meetingLayers === 2 || fail("meeting implementation is not traced through server and client")) &&
      (fact.resourceLayers === 4 || fail("resource implementation is not traced through persistence, contract, server and client")) &&
      (fact.meetingVerifications === 2 || fail("meeting verification is not traced through server and client")) &&
      (fact.resourceVerifications === 3 || fail("resource verification is not traced through SQL, server and client"))
      """
