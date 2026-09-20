@trust-dsl:1 @operation:hall.municipality-review-projection @version:0.1.0
Feature: Synchronize observed municipality requirement and clarification reports to Maket
  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
      | maketMcpUrl | url |
    And Input
      | input | type | cardinality |
      | documentName | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | documentName | string | one | any |
      | revision | number | one | any |
      | reportCount | number | one | any |
      | sourceMatch | string | one | enum "yes", "no" |
      | catalogueDigest | string | one | any |
      | report | string | one | any |
  Scenario: Run
    When Shell "project" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | docs/clarification-commune/project-maket.mjs | literal |
      | documentName | Input "documentName" |
      | http://127.0.0.1:24843/mcp | literal |
    And File "receipt" reads "docs/clarification-commune/projection-receipt.json" as JSON from Environment "workspaceRoot"
    Then Produce with JSONata
      """
      {"documentName":steps.receipt.content.documentName,"revision":steps.receipt.content.revision,"reportCount":steps.receipt.content.reportCount,"sourceMatch":steps.receipt.content.sourceMatch,"catalogueDigest":steps.receipt.content.catalogueDigest,"report":steps.receipt.content.report}
      """
