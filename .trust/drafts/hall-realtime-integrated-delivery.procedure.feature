@trust-dsl:1 @procedure:hall-realtime-integrated-delivery @version:0.1.0 @intent-chaining
Feature: Independently qualify Hall realtime delivery coherence

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Read an independent sourced review of requirements, contract, persistence, server and client coherence. | Treat an implementer's declaration as an independent review or suppress a genuine contradiction. |
    And one string "review report"

  @scenario:coherence
  Scenario: Qualify the cross-layer review
    Then Check "Realtime cross-layer coherence" runs Operation "hall.realtime-integrated-review@0.1.0" on "review report" as Input "reportFile" and must establish "independent review finds no unresolved product decision or delivery gap"
      """js
      (fact.scope === "integrated" || fail("wrong review scope")) &&
      (fact.findingCount > 0 || fail("review has no findings")) &&
      (fact.evidenceCount > 0 || fail("review has no code sources")) &&
      (fact.openDecisionCount === 0 || fail("product decision remains open")) &&
      (fact.deliveryReady === "yes" || fail("cross-layer proof is incomplete"))
      """
