@trust-dsl:1 @procedure:hall-work-bootstrap @version:0.1.0 @intent-chaining
Feature: Hall — Démarrage de la coordination
  The coordinator is the interface between the user and coding or review agents.
  Record his words faithfully even when incomplete; retain unknowns and ask necessary
  questions until a sufficient initial framing is available. Never fill gaps by inference.
  If the Git baseline is dirty, present pending paths to the user and ask what to do.
  Do not resolve WIP automatically or continue dependent Checks before his decision
  and a satisfied baseline. No exception is inferred for drafts or agent-owned files.
  Distinguish the user decisions, agent proposals and observed facts. Control delegated
  work and report verified facts, without inventing product choices or future missions.
  Before each Check read its current intent, use it exactly with the Hall Runner,
  and declare the next intent while work remains. Use the final URI only at the last Check.
  First readings need no existing Maket document. Exit requires a projected and reread
  initial framing and the human yes bound to it. Discussion, document existence or
  technical success never authorizes feature start. No feature is engaged by this Procedure.
  Background: Plan context
    Given Procedure scope
      | check | authorized | forbidden |
      | all | Load Hall context; identify only the development runtime and database using technical metadata; faithfully record sourced discussion, decisions, proposals and unknowns; ask the user for initial framing; project and reread the dedicated Maket support; observe his start choice. | Target production or Alésia; read secrets or business records; start, stop or reset runtime; commit, stash, discard or clean WIP; infer missing product intent; invent business rules, rights or model changes; write the human yes or no; start a feature before explicit go; implement, migrate, run application tests, commit, push, deploy, publish or engage any other Plan. |
      | Project and reread the initial framing | Create the named bootstrap document when absent; update only bootstrap-owned framing fields, reset its choice to pending on changed framing, render and reread it. | Replace an unrelated document or other human fields; treat structural completeness as exhaustive feature definition or approval. |
      | Read the user feature-start decision | Read the choice for the exact presented framing; return a bounded start authorization only on yes and a currently identified ready development target. | Infer authorization from pending, no, stale framing or technical results; treat initial go as approval of unspecified schema, migration or implementation. |
    And one string "instructions" fixed as "instructions"
    And one string "version" fixed as "version"
    And one string "backlog" fixed as "backlog"
    And one string "requirements" fixed as "requirements"
    And one string "architecture" fixed as "architecture"
    And one string "interface" fixed as "interface"
    And one string "workflow" fixed as "workflow"
    And one string "git mode" fixed as "git"
    And one string "target mode" fixed as "target"
    And one string "ready mode" fixed as "ready"
    And one string "framing mode" fixed as "framing"
    And one string "project mode" fixed as "project"
    And one string "gate mode" fixed as "gate"
    And one string "development target" fixed as "shared Hall development only"
    And one string "discussion file" declared by agent
    And one string "framing snapshot"
    And one string "review snapshot"
    And one string "feature start authorization" returned

  @scenario:step-1
  Scenario: 1. Read project instructions
    Then Check "Read project instructions" runs Operation "hall.bootstrap-sources-read@0.1.0"
      on "instructions" as Input "group"
      and must establish "the instructions sources are loaded as text, without proving comprehension"
      """js
      fact.group === context["instructions"] && fact.loadedSources !== "" || fail("The expected sources were not loaded")
      """

  @scenario:step-2
  Scenario: 2. Read the current declared Hall version
    Given scenario "step-1" is validated
    Then Check "Read the current declared Hall version" runs Operation "hall.bootstrap-sources-read@0.1.0"
      on "version" as Input "group"
      and must establish "the checkout package version is loaded; no version bump or deployed-version claim is made"
      """js
      fact.group === context.version && fact.loadedSources !== "" || fail("The version source was not loaded")
      """

  @scenario:step-3
  Scenario: 3. Observe the Git baseline
    Given scenario "step-2" is validated
    Then Check "Observe the Git baseline" runs Operation "hall.coordination-bootstrap-step@0.1.0"
      on "git mode" as Input "mode"
      using "development target" as Input "input"
      and must establish "the index, tracked files and nonignored untracked files have nothing to commit; otherwise report pending paths, ask the user what to do and stop dependent work"
      """js
      fact.mode === "git" && fact.exitCode === 0 && fact.observation !== "" || fail("Git baseline is dirty or unavailable; report paths and await explicit direction without changing files")
      """

  @scenario:step-4
  Scenario: 4. Read the current backlog
    Given scenario "step-3" is validated
    Then Check "Read the current backlog" runs Operation "hall.bootstrap-sources-read@0.1.0"
      on "backlog" as Input "group"
      and must establish "the backlog sources are loaded as text, without proving comprehension"
      """js
      fact.group === context["backlog"] && fact.loadedSources !== "" || fail("The expected sources were not loaded")
      """

  @scenario:step-5
  Scenario: 5. Read the requirement catalogue and traceability convention
    Given scenario "step-4" is validated
    Then Check "Read the requirement catalogue and traceability convention" runs Operation "hall.bootstrap-sources-read@0.1.0"
      on "requirements" as Input "group"
      and must establish "the requirements sources are loaded as text, without proving comprehension"
      """js
      fact.group === context["requirements"] && fact.loadedSources !== "" || fail("The expected sources were not loaded")
      """

  @scenario:step-6
  Scenario: 6. Read architecture and code principles
    Given scenario "step-5" is validated
    Then Check "Read architecture and code principles" runs Operation "hall.bootstrap-sources-read@0.1.0"
      on "architecture" as Input "group"
      and must establish "the architecture sources are loaded as text, without proving comprehension"
      """js
      fact.group === context["architecture"] && fact.loadedSources !== "" || fail("The expected sources were not loaded")
      """

  @scenario:step-7
  Scenario: 7. Read interface principles
    Given scenario "step-6" is validated
    Then Check "Read interface principles" runs Operation "hall.bootstrap-sources-read@0.1.0"
      on "interface" as Input "group"
      and must establish "the interface sources are loaded as text, without proving comprehension"
      """js
      fact.group === context["interface"] && fact.loadedSources !== "" || fail("The expected sources were not loaded")
      """

  @scenario:step-8
  Scenario: 8. Read established TRUST and Maket practice
    Given scenario "step-7" is validated
    Then Check "Read established TRUST and Maket practice" runs Operation "hall.bootstrap-sources-read@0.1.0"
      on "workflow" as Input "group"
      and must establish "the workflow sources are loaded as text, without proving comprehension"
      """js
      fact.group === context["workflow"] && fact.loadedSources !== "" || fail("The expected sources were not loaded")
      """

  @scenario:step-9
  Scenario: 9. Identify the development runtime and database
    Given scenario "step-8" is validated
    Then Check "Identify the development runtime and database" runs Operation "hall.coordination-bootstrap-step@0.1.0"
      on "target mode" as Input "mode"
      using "development target" as Input "input"
      and must establish "the API process, shared session, development socket and database identity are observed together; unknown targets fail"
      """js
      fact.mode === "target" && fact.exitCode === 0 && fact.observation !== "" || fail("Bootstrap observation not satisfied; read the returned reason without inventing approval or target identity")
      """

  @scenario:step-10
  Scenario: 10. Observe shared development readiness
    Given scenario "step-9" is validated
    Then Check "Observe shared development readiness" runs Operation "hall.coordination-bootstrap-step@0.1.0"
      on "ready mode" as Input "mode"
      using "development target" as Input "input"
      and must establish "the identified development target and shared API and client are currently ready, not merely started"
      """js
      fact.mode === "ready" && fact.exitCode === 0 && fact.observation !== "" || fail("Bootstrap observation not satisfied; read the returned reason without inventing approval or target identity")
      """

  @scenario:step-11
  Scenario: 11. Load faithful discussion and initial framing
    Given scenario "step-10" is validated
    Then Check "Load faithful discussion and initial framing" runs Operation "hall.coordination-bootstrap-step@0.1.0"
      on "framing mode" as Input "mode"
      using "discussion file" as Input "input"
      and materializes "framing snapshot" from field "observation"
      and must establish "the sourced request, initial scope, decisions, proposals, retained unknowns and broad domains are loaded; uncertain domains are allowed"
      """js
      fact.mode === "framing" && fact.exitCode === 0 && fact.observation !== "" || fail("Bootstrap observation not satisfied; read the returned reason without inventing approval or target identity")
      """

  @scenario:step-12
  Scenario: 12. Project and reread the initial framing
    Given scenario "step-11" is validated
    Then Check "Project and reread the initial framing" runs Operation "hall.coordination-bootstrap-step@0.1.0"
      on "project mode" as Input "mode"
      using "framing snapshot" as Input "input"
      and materializes "review snapshot" from field "observation"
      and must establish "the first-framing document is populated and reread identically with a human selector initially pending; schema consequences remain explicit"
      """js
      fact.mode === "project" && fact.exitCode === 0 && fact.observation !== "" || fail("Bootstrap observation not satisfied; read the returned reason without inventing approval or target identity")
      """

  @scenario:step-13
  Scenario: 13. Read the user feature-start decision
    Given scenario "step-12" is validated
    Then Check "Read the user feature-start decision" runs Operation "hall.coordination-bootstrap-step@0.1.0"
      on "gate mode" as Input "mode"
      using "review snapshot" as Input "input"
      and materializes "feature start authorization" from field "observation"
      and must establish "the user selected yes for the unchanged reviewed framing and the development target remains ready; this does not start or implement a feature"
      """js
      fact.mode === "gate" && fact.exitCode === 0 && fact.observation !== "" || fail("Bootstrap observation not satisfied; read the returned reason without inventing approval or target identity")
      """

