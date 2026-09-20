# language: en
@trust-dsl:1 @operation:hall.committee-sql-verification @version:0.3.0
Feature: Verify committee-link SQL and project observed results into the living Maket document

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | requirementId | string | one |
      | documentName | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | requirementId | string | one | any |
      | documentName | string | one | any |
      | scenarioSlugsCsv | string | one | any |
      | traceStatus | string | one | enum "passed", "failed" |
      | requirementsStatus | string | one | enum "passed", "failed" |
      | architectureStatus | string | one | enum "passed", "failed" |
      | postgresTypesStatus | string | one | enum "passed", "failed" |
      | pgtapStatus | string | one | enum "passed", "failed" |
      | resultStatus | string | one | enum "passed", "failed" |
      | projectionStatus | string | one | enum "passed", "failed" |
      | projectionRevision | string | one | any |
      | report | string | one | any |

  Scenario: Run
    When Shell "verifyAndProjectSql" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/verify-and-project-committee-sql-v3.mjs | literal |
      | requirementId | Input "requirementId" |
      | documentName | Input "documentName" |
    And Shell "verifyAndProjectSql" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | projection:passed | |
      | 1 | projection:failed | |
    Then Produce with JSONata
      """
      {
        "requirementId": $substringBefore($substringAfter(steps.verifyAndProjectSql.stdout, "requirement:"), "\n"),
        "documentName": input.documentName,
        "scenarioSlugsCsv": $substringBefore($substringAfter(steps.verifyAndProjectSql.stdout, "scenario-slugs:"), "\n"),
        "traceStatus": $substringBefore($substringAfter(steps.verifyAndProjectSql.stdout, "trace:"), "\n"),
        "requirementsStatus": $substringBefore($substringAfter(steps.verifyAndProjectSql.stdout, "requirements:"), "\n"),
        "architectureStatus": $substringBefore($substringAfter(steps.verifyAndProjectSql.stdout, "architecture:"), "\n"),
        "postgresTypesStatus": $substringBefore($substringAfter(steps.verifyAndProjectSql.stdout, "postgres-types:"), "\n"),
        "pgtapStatus": $substringBefore($substringAfter(steps.verifyAndProjectSql.stdout, "pgtap:"), "\n"),
        "resultStatus": $substringBefore($substringAfter(steps.verifyAndProjectSql.stdout, "result:"), "\n"),
        "projectionStatus": $substringBefore($substringAfter(steps.verifyAndProjectSql.stdout, "projection:"), "\n"),
        "projectionRevision": $substringBefore($substringAfter(steps.verifyAndProjectSql.stdout, "projection-revision:"), "\n"),
        "report": steps.verifyAndProjectSql.stdout & steps.verifyAndProjectSql.stderr
      }
      """
