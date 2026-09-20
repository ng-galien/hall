# language: en
@trust-dsl:1 @operation:hall.committee-http-targeted-delivery @version:0.1.0
Feature: Verify HTTP and Siren committee links with targeted tests and project observed results

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | documentName | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | requirementId | string | one | any |
      | documentName | string | one | any |
      | layer | string | one | any |
      | resultStatus | string | one | enum "passed", "failed" |
      | projectionStatus | string | one | enum "passed", "failed" |
      | report | string | one | any |

  Scenario: Run
    When Shell "verifyHttp" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/verify-and-project-committee-layer.mjs | literal |
      | http | literal |
      | HALL-FR-BUS-070 | literal |
      | documentName | Input "documentName" |
    And Shell "verifyHttp" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | projection:passed | |
      | 1 | projection:failed | |
    Then Produce with JSONata
      """
      {
        "requirementId": $substringBefore($substringAfter(steps.verifyHttp.stdout, "requirement:"), "\n"),
        "documentName": input.documentName,
        "layer": "http",
        "resultStatus": $substringBefore($substringAfter(steps.verifyHttp.stdout, "result:"), "\n"),
        "projectionStatus": $substringBefore($substringAfter(steps.verifyHttp.stdout, "projection:"), "\n"),
        "report": steps.verifyHttp.stdout & steps.verifyHttp.stderr
      }
      """
