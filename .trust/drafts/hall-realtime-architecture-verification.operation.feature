@trust-dsl:1 @operation:hall.realtime-architecture-verification @version:0.2.0
Feature: Observe Hall architecture and taxonomy gates after realtime delivery

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | requirementId | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | requirements | string | one | enum "passed" |
      | architecture | string | one | enum "passed" |
      | classified | number | one | any |
      | unclassified | number | one | any |
      | invalid | number | one | any |
      | violations | number | one | any |
      | zeroAntecedents | number | one | any |
      | meetingLayers | number | one | any |
      | resourceLayers | number | one | any |
      | meetingVerifications | number | one | any |
      | resourceVerifications | number | one | any |

  Scenario: Run
    When Shell "verifyArchitecture" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/verify-realtime-architecture.mjs | literal |
      | requirementId | Input "requirementId" |
    And Shell "verifyArchitecture" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | architecture:passed | |
    Then Produce with JSONata
      """jsonata
      {
        "requirements": $substringBefore($substringAfter(steps.verifyArchitecture.stdout, "requirements:"), "\n"),
        "architecture": $substringBefore($substringAfter(steps.verifyArchitecture.stdout, "architecture:"), "\n"),
        "classified": $number($substringBefore($substringAfter(steps.verifyArchitecture.stdout, "classified:"), "\n")),
        "unclassified": $number($substringBefore($substringAfter(steps.verifyArchitecture.stdout, "unclassified:"), "\n")),
        "invalid": $number($substringBefore($substringAfter(steps.verifyArchitecture.stdout, "invalid:"), "\n")),
        "violations": $number($substringBefore($substringAfter(steps.verifyArchitecture.stdout, "violations:"), "\n")),
        "zeroAntecedents": $number($substringBefore($substringAfter(steps.verifyArchitecture.stdout, "zeroAntecedents:"), "\n")),
        "meetingLayers": $number($substringBefore($substringAfter(steps.verifyArchitecture.stdout, "meetingLayers:"), "\n")),
        "resourceLayers": $number($substringBefore($substringAfter(steps.verifyArchitecture.stdout, "resourceLayers:"), "\n")),
        "meetingVerifications": $number($substringBefore($substringAfter(steps.verifyArchitecture.stdout, "meetingVerifications:"), "\n")),
        "resourceVerifications": $number($substringBefore($substringAfter(steps.verifyArchitecture.stdout, "resourceVerifications:"), "\n"))
      }
      """
