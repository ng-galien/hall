@trust-dsl:1 @operation:hall.realtime-resource-verification @version:0.1.0
Feature: Verify Hall text-resource history with focused PostgreSQL and HTTP tests

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | requirementId | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | scope | string | one | any |
      | documentPgTap | string | one | enum "passed" |
      | httpPostgres | string | one | enum "passed" |

  Scenario: Run
    When Shell "verifyResource" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/verify-realtime-resource.mjs | literal |
      | requirementId | Input "requirementId" |
    And Shell "verifyResource" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | httpPostgres:passed | |
    Then Produce with JSONata
      """jsonata
      {
        "scope": $substringBefore($substringAfter(steps.verifyResource.stdout, "scope:"), "\n"),
        "documentPgTap": $substringBefore($substringAfter(steps.verifyResource.stdout, "documentPgTap:"), "\n"),
        "httpPostgres": $substringBefore($substringAfter(steps.verifyResource.stdout, "httpPostgres:"), "\n")
      }
      """
