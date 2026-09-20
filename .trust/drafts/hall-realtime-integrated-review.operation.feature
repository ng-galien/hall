@trust-dsl:1 @operation:hall.realtime-integrated-review @version:0.1.0
Feature: Read the independent cross-layer Hall realtime delivery review

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | reportFile | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | scope | string | one | any |
      | findingCount | number | one | any |
      | evidenceCount | number | one | any |
      | openDecisionCount | number | one | any |
      | riskCount | number | one | any |
      | deliveryReady | string | one | enum "yes", "no" |

  Scenario: Run
    When Shell "readIntegratedReview" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/read-realtime-integrated-review.mjs | literal |
      | reportFile | Input "reportFile" |
    And Shell "readIntegratedReview" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | scope:integrated | |
    Then Produce with JSONata
      """jsonata
      {
        "scope": $substringBefore($substringAfter(steps.readIntegratedReview.stdout, "scope:"), "\n"),
        "findingCount": $number($substringBefore($substringAfter(steps.readIntegratedReview.stdout, "findingCount:"), "\n")),
        "evidenceCount": $number($substringBefore($substringAfter(steps.readIntegratedReview.stdout, "evidenceCount:"), "\n")),
        "openDecisionCount": $number($substringBefore($substringAfter(steps.readIntegratedReview.stdout, "openDecisionCount:"), "\n")),
        "riskCount": $number($substringBefore($substringAfter(steps.readIntegratedReview.stdout, "riskCount:"), "\n")),
        "deliveryReady": $substringBefore($substringAfter(steps.readIntegratedReview.stdout, "deliveryReady:"), "\n")
      }
      """
