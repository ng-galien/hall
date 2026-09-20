# language: en
@trust-dsl:1 @operation:hall.maket-document-readiness @version:0.1.0
Feature: Read a Hall feature document from Maket and compare its JSON with the requirement catalog

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
      | requirementIds | string | many | any |
      | status | string | one | enum "ready", "incomplete" |
      | reviewDecision | string | one | enum "pending", "approved", "rejected", "missing" |
      | observedRevision | string | one | any |
      | report | string | one | any |

  Scenario: Run
    When Shell "readDocument" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/read-maket-document-readiness.mjs | literal |
      | documentName | Input "documentName" |
    And Shell "readDocument" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | revision: | |
      | 1 | issue: | |
    Then Produce with JSONata
      """
      {
        "documentName": input.documentName,
        "featureTitle": $substringBefore($substringAfter(steps.readDocument.stdout, "feature:"), "\n"),
        "requirementIds": $split($substringBefore($substringAfter(steps.readDocument.stdout, "requirements:"), "\n"), ","),
        "status": steps.readDocument.exitCode = 0 ? "ready" : "incomplete",
        "reviewDecision": $substringBefore($substringAfter(steps.readDocument.stdout, "decision:"), "\n"),
        "observedRevision": $substringBefore($substringAfter(steps.readDocument.stdout, "revision:"), "\n"),
        "report": steps.readDocument.stdout & steps.readDocument.stderr
      }
      """
