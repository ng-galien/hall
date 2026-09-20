@trust-dsl:1 @operation:hall.realtime-review-report @version:0.1.0
Feature: Read a sourced Hall realtime agent review

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | reportFile | string | one |
      | expectedScope | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | scope | string | one | any |
      | findings | string | many | any |
      | evidencePaths | string | many | any |
      | decisionStatus | string | one | enum "clear", "needs-resolution" |

  Scenario: Run
    When Shell "readReport" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/read-realtime-review-report.mjs | literal |
      | reportFile | Input "reportFile" |
      | expectedScope | Input "expectedScope" |
    And Shell "readReport" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | scope: | |
    Then Produce with JSONata
      """jsonata
      {
        "scope": $substringBefore($substringAfter(steps.readReport.stdout, "scope:"), "\n"),
        "findings": $split($substringBefore($substringAfter(steps.readReport.stdout, "findings:"), "\n"), "|"),
        "evidencePaths": $split($substringBefore($substringAfter(steps.readReport.stdout, "evidence:"), "\n"), "|"),
        "decisionStatus": $substringBefore($substringAfter(steps.readReport.stdout, "decisionStatus:"), "\n")
      }
      """
