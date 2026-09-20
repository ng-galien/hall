@trust-dsl:1 @operation:hall.bootstrap-sources-read @version:0.1.0
Feature: Load one named group of Hall working instructions
  Background: Operation interface
    Given Environment
      | name | type |
      | workspaceRoot | directory |
    And Input
      | input | type | cardinality |
      | group | string | one |
    And Produced fields
      | field | type | cardinality | domain |
      | group | string | one | any |
      | loadedSources | string | one | any |
  Scenario: Run
    When Shell "read" runs "node" with cwd from Environment "workspaceRoot"
      | argument | source |
      | -e | literal |
      | const fs=require("node:fs");const groups={"instructions":["AGENTS.md"],"version":["package.json"],"backlog":["backlog/backlog.md"],"requirements":["requirements/catalog.json","requirements/README.md","docs/requirements.md"],"architecture":["docs/architecture.md","docs/principes-code.md"],"interface":["docs/principes-interface.md"],"workflow":["docs/trust-workflow.md","docs/trust-adoption.md","docs/living-feature-document.md","docs/maket-feature-workspace/HANDOFF.md","docs/private-runtime.md","docs/local-production.md","scripts/development/dev-session.mjs"]};const files=groups[process.argv[1]];if(!files)throw Error("Unknown source group");for(const path of files){const content=fs.readFileSync(path,"utf8");if(!content.trim())throw Error("Empty source: "+path);console.log(JSON.stringify({path,content}));} | literal |
      | group | Input "group" |
    Then Produce with JSONata
      """
      {"group":input.group,"loadedSources":steps.read.stdout}
      """
