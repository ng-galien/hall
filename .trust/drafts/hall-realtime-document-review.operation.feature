@trust-dsl:1 @operation:hall.realtime-document-review @version:0.1.0
Feature: Read the live Hall realtime review document

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | documentName | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | documentName | string | one | any |
      | featureTitle | string | one | any |
      | observedRevision | string | one | any |
      | questions | string | many | any |
      | reviewDecision | string | one | enum "pending", "approved", "rejected" |

  Scenario: Run
    When Shell "readDocument" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/read-realtime-document-review.mjs | literal |
      | documentName | Input "documentName" |
    And Shell "readDocument" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | revision: | |
    Then Produce with JSONata
      """
      {
        "documentName": input.documentName,
        "featureTitle": $substringBefore($substringAfter(steps.readDocument.stdout, "feature:"), "\n"),
        "observedRevision": $substringBefore($substringAfter(steps.readDocument.stdout, "revision:"), "\n"),
        "questions": $split($substringBefore($substringAfter(steps.readDocument.stdout, "questions:"), "\n"), "|"),
        "reviewDecision": $substringBefore($substringAfter(steps.readDocument.stdout, "decision:"), "\n")
      }
      """
