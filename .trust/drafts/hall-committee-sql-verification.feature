# language: en
@trust-dsl:1 @operation:hall.committee-sql-verification @version:0.1.0
Feature: Execute the Hall committee-link SQL requirement gate

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | requirementId | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | requirementId | string | one | any |
      | scenarioSlugsCsv | string | one | any |
      | traceStatus | string | one | enum "passed", "failed" |
      | requirementsStatus | string | one | enum "passed", "failed" |
      | architectureStatus | string | one | enum "passed", "failed" |
      | postgresTypesStatus | string | one | enum "passed", "failed" |
      | pgtapStatus | string | one | enum "passed", "failed" |
      | resultStatus | string | one | enum "passed", "failed" |
      | report | string | one | any |

  Scenario: Run
    When Shell "verifySql" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/verify-committee-sql.mjs | literal |
    And Shell "verifySql" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | result:passed | |
      | 1 | result:failed | |
    Then Produce with JSONata
      """
      {
        "requirementId": $substringBefore($substringAfter(steps.verifySql.stdout, "requirement:"), "\n"),
        "scenarioSlugsCsv": $substringBefore($substringAfter(steps.verifySql.stdout, "scenario-slugs:"), "\n"),
        "traceStatus": $substringBefore($substringAfter(steps.verifySql.stdout, "trace:"), "\n"),
        "requirementsStatus": $substringBefore($substringAfter(steps.verifySql.stdout, "requirements:"), "\n"),
        "architectureStatus": $substringBefore($substringAfter(steps.verifySql.stdout, "architecture:"), "\n"),
        "postgresTypesStatus": $substringBefore($substringAfter(steps.verifySql.stdout, "postgres-types:"), "\n"),
        "pgtapStatus": $substringBefore($substringAfter(steps.verifySql.stdout, "pgtap:"), "\n"),
        "resultStatus": $substringBefore($substringAfter(steps.verifySql.stdout, "result:"), "\n"),
        "report": steps.verifySql.stdout & steps.verifySql.stderr
      }
      """
