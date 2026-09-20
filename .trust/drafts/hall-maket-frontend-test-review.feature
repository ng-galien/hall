# language: en
@trust-dsl:1 @operation:hall.maket-frontend-test-review @version:0.1.0
Feature: Read frontend and test review with prior SQL and HTTP/Siren decisions

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
      | observedRevision | string | one | any |
      | structureStatus | string | one | enum "valid", "incomplete" |
      | findingIdsCsv | string | one | any |
      | escalationIdsCsv | string | one | any |
      | escalationCount | number | one | any |
      | proofLayersCsv | string | one | any |
      | reviewSnapshotJson | string | one | any |
      | report | string | one | any |

  Scenario: Run
    When Shell "readReview" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/read-maket-frontend-test-review.mjs | literal |
      | documentName | Input "documentName" |
    And Shell "readReview" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | revision: | |
      | 1 | issue: | |
    Then Produce with JSONata
      """
      {
        "documentName": input.documentName,
        "observedRevision": $substringBefore($substringAfter(steps.readReview.stdout, "revision:"), "\n"),
        "structureStatus": steps.readReview.exitCode = 0 ? "valid" : "incomplete",
        "findingIdsCsv": $substringBefore($substringAfter(steps.readReview.stdout, "finding-ids:"), "\n"),
        "escalationIdsCsv": $substringBefore($substringAfter(steps.readReview.stdout, "escalation-ids:"), "\n"),
        "escalationCount": $number($substringBefore($substringAfter(steps.readReview.stdout, "escalation-count:"), "\n")),
        "proofLayersCsv": $substringBefore($substringAfter(steps.readReview.stdout, "proof-layers:"), "\n"),
        "reviewSnapshotJson": $substringBefore($substringAfter(steps.readReview.stdout, "review-json:"), "\n"),
        "report": steps.readReview.stdout & steps.readReview.stderr
      }
      """
