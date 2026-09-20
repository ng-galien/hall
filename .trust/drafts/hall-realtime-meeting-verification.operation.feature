@trust-dsl:1 @operation:hall.realtime-meeting-verification @version:0.2.0
Feature: Verify Hall meeting realtime events with focused server tests

  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | requirementId | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | scope | string | one | any |
      | contractBuild | string | one | enum "passed" |
      | serverTypecheck | string | one | enum "passed" |
      | focusedTests | string | one | enum "passed" |

  Scenario: Run
    When Shell "verifyMeeting" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | scripts/trust/verify-realtime-meeting.mjs | literal |
      | requirementId | Input "requirementId" |
    And Shell "verifyMeeting" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | focusedTests:passed | |
    Then Produce with JSONata
      """jsonata
      {
        "scope": $substringBefore($substringAfter(steps.verifyMeeting.stdout, "scope:"), "\n"),
        "contractBuild": $substringBefore($substringAfter(steps.verifyMeeting.stdout, "contractBuild:"), "\n"),
        "serverTypecheck": $substringBefore($substringAfter(steps.verifyMeeting.stdout, "serverTypecheck:"), "\n"),
        "focusedTests": $substringBefore($substringAfter(steps.verifyMeeting.stdout, "focusedTests:"), "\n")
      }
      """
