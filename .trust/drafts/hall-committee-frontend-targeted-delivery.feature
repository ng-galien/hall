# language: en
@trust-dsl:1 @operation:hall.committee-frontend-targeted-delivery @version:0.1.0
Feature: Verify the committee-link component and its focused Playwright scenario

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
    When Shell "verifyFrontend" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/verify-and-project-committee-layer.mjs | literal |
      | frontend | literal |
      | HALL-FR-BUS-070 | literal |
      | documentName | Input "documentName" |
    And Shell "verifyFrontend" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | projection:passed | |
      | 1 | projection:failed | |
    Then Produce with JSONata
      """
      {
        "requirementId": $substringBefore($substringAfter(steps.verifyFrontend.stdout, "requirement:"), "\n"),
        "documentName": input.documentName,
        "layer": "frontend",
        "resultStatus": $substringBefore($substringAfter(steps.verifyFrontend.stdout, "result:"), "\n"),
        "projectionStatus": $substringBefore($substringAfter(steps.verifyFrontend.stdout, "projection:"), "\n"),
        "report": steps.verifyFrontend.stdout & steps.verifyFrontend.stderr
      }
      """
