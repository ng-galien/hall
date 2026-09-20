@trust-dsl:1 @operation:hall.realtime-frontend-verification @version:0.1.0
Feature: Verify Hall realtime frontend with its declared design skill

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | requiredSkill | string | one |
      | reportFile | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | scope | string | one | any |
      | skill | string | one | any |
      | skillApplicationCount | number | one | any |
      | fileCount | number | one | any |
      | typecheck | string | one | enum "passed" |
      | componentTests | string | one | enum "passed" |

  Scenario: Run
    When Shell "verifyFrontend" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/verify-realtime-frontend.mjs | literal |
      | requiredSkill | Input "requiredSkill" |
      | reportFile | Input "reportFile" |
    And Shell "verifyFrontend" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | componentTests:passed | |
    Then Produce with JSONata
      """jsonata
      {
        "scope": $substringBefore($substringAfter(steps.verifyFrontend.stdout, "scope:"), "\n"),
        "skill": $substringBefore($substringAfter(steps.verifyFrontend.stdout, "skill:"), "\n"),
        "skillApplicationCount": $number($substringBefore($substringAfter(steps.verifyFrontend.stdout, "skillApplicationCount:"), "\n")),
        "fileCount": $number($substringBefore($substringAfter(steps.verifyFrontend.stdout, "fileCount:"), "\n")),
        "typecheck": $substringBefore($substringAfter(steps.verifyFrontend.stdout, "typecheck:"), "\n"),
        "componentTests": $substringBefore($substringAfter(steps.verifyFrontend.stdout, "componentTests:"), "\n")
      }
      """
