# language: en
@trust-dsl:1 @procedure:hall-committee-sql-delivery @version:0.1.0
Feature: Verify the accepted Hall committee-link SQL requirement against real pgTAP results

  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Inspect the accepted Hall requirement and SQL/test markers; run architecture, requirement, PostgreSQL type and council pgTAP checks on the disposable test runtime; retain observed test slugs and verdict. | Change production data or the shared development runtime; infer success from a command that merely started; weaken tests to obtain a green verdict. |
    And one string "requirement id"
    And one string "scenario slugs csv"

  @scenario:sql-gate
  Scenario: SQL implementation is traced and verified
    Then Check "Committee-link SQL requirement and pgTAP are green" runs Operation "hall.committee-sql-verification@0.1.0"
        on "requirement id" as Input "requirementId"
        and materializes "scenario slugs csv" from field "scenarioSlugsCsv"
        and must establish "the accepted requirement has a SQL implementation, stable scenario slugs and passing architecture, requirement, type and pgTAP checks"
      """js
      (fact.requirementId === context["requirement id"] || fail("Another requirement was verified")) &&
      (fact.traceStatus === "passed" || fail(`Requirement or test trace missing: ${fact.report}`)) &&
      (fact.scenarioSlugsCsv.includes("bus-070-") || fail("No stable SQL test slug was observed")) &&
      (fact.requirementsStatus === "passed" || fail(`Requirement gate failed: ${fact.report}`)) &&
      (fact.architectureStatus === "passed" || fail(`Architecture gate failed: ${fact.report}`)) &&
      (fact.postgresTypesStatus === "passed" || fail(`PostgreSQL typecheck failed: ${fact.report}`)) &&
      (fact.pgtapStatus === "passed" || fail(`Council pgTAP failed: ${fact.report}`)) &&
      (fact.resultStatus === "passed" || fail(`SQL verification failed: ${fact.report}`))
      """
