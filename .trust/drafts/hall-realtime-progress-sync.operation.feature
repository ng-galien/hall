@trust-dsl:1 @operation:hall.realtime-progress-sync @version:0.1.0
Feature: Project observed Hall realtime Plan progress into the Maket journal

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | planName | string | one |
      | documentName | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | planName | string | one | any |
      | reviewStatus | string | one | enum "validated", "open" |
      | childCount | number | one | any |
      | documentPage | string | one | any |
      | documentRevision | string | one | any |

  Scenario: Run
    When Shell "syncJournal" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/sync-realtime-progress.mjs | literal |
      | planName | Input "planName" |
      | documentName | Input "documentName" |
    And Shell "syncJournal" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | document:journal-page-6 | |
    Then Produce with JSONata
      """jsonata
      {
        "planName": $substringBefore($substringAfter(steps.syncJournal.stdout, "plan:"), "\n"),
        "reviewStatus": $substringBefore($substringAfter(steps.syncJournal.stdout, "review:"), "\n"),
        "childCount": $number($substringBefore($substringAfter(steps.syncJournal.stdout, "children:"), "\n")),
        "documentPage": $substringBefore($substringAfter(steps.syncJournal.stdout, "document:"), "\n"),
        "documentRevision": $substringBefore($substringAfter(steps.syncJournal.stdout, "documentRevision:"), "\n")
      }
      """
