@trust-dsl:1 @operation:hall.realtime-document-review @version:0.2.0
Feature: Read Hall's reviewed realtime document and catalogue

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
      | decisions | string | many | any |
      | requirementIds | string | many | any |
      | reviewDecision | string | one | enum "pending", "approved", "rejected" |
      | reviewCommentPresent | string | one | enum "yes", "no" |
      | catalogueAligned | string | one | enum "yes", "no" |

  Scenario: Run
    When Shell "readDocument" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/read-realtime-document-review.mjs | literal |
      | documentName | Input "documentName" |
    And Shell "readDocument" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | revision: | |
    Then Produce with JSONata
      """jsonata
      {
        "documentName": input.documentName,
        "featureTitle": $substringBefore($substringAfter(steps.readDocument.stdout, "feature:"), "\n"),
        "observedRevision": $substringBefore($substringAfter(steps.readDocument.stdout, "revision:"), "\n"),
        "decisions": $split($substringBefore($substringAfter(steps.readDocument.stdout, "questions:"), "\n"), "|"),
        "requirementIds": $split($substringBefore($substringAfter(steps.readDocument.stdout, "requirementIds:"), "\n"), "|"),
        "reviewDecision": $substringBefore($substringAfter(steps.readDocument.stdout, "decision:"), "\n"),
        "reviewCommentPresent": $substringBefore($substringAfter(steps.readDocument.stdout, "commentPresent:"), "\n"),
        "catalogueAligned": $substringBefore($substringAfter(steps.readDocument.stdout, "catalogAligned:"), "\n")
      }
      """
