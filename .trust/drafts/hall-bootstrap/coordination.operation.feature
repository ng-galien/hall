@trust-dsl:1 @operation:hall.coordination-bootstrap-step @version:0.1.0
Feature: Observe one bounded coordination bootstrap action
  Modes target and ready inspect only the shared development session and technical database metadata.
  Framing loads sourced discussion context. Project writes and rereads its Maket support.
  Gate reads the human choice for exactly that framing and rechecks development readiness.
  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | mode | string | one |
      | input | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | mode | string | one | any |
      | exitCode | number | one | any |
      | observation | string | one | any |
  Scenario: Run
    When Shell "observe" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | .trust/drafts/hall-bootstrap/coordinate.mjs | literal |
      | mode | Input "mode" |
      | input | Input "input" |
    And Shell "observe" accepts exits
      | exit code | stdout contains | stderr contains |
      | 0 | | |
      | 1 | | |
    Then Produce with JSONata
      """
      {"mode":input.mode,"exitCode":steps.observe.exitCode,"observation":steps.observe.stdout}
      """
