import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { onTestFinished, test } from "vitest";
import { resourceFillsExtendedView, resourceSupportsAutosave } from "../src/features/resources/resourceEditorPolicy.ts";
import { useResourceSaveStatus, useSaveStatusStore } from "../src/pages/workspace/saveStatusStore.ts";

const cases = [
  ["text", false, true],
  ["spreadsheet", true, true],
  ["document", true, false],
  ["remote", true, true],
  ["geographic", true, true],
  ["legalReference", false, false],
];

test("each resource kind has one stable editor layout and autosave policy", () => {
  for (const [kind, fillsExtendedView, supportsAutosave] of cases) {
    const resource = { kind };
    assert.equal(resourceFillsExtendedView(resource), fillsExtendedView, kind);
    assert.equal(resourceSupportsAutosave(resource), supportsAutosave, kind);
  }
});

function saveSessions(...names) {
  const sessions = names.map((name) => Symbol(name));
  const store = useSaveStatusStore.getState();
  for (const session of sessions) store.registerSession(session);
  onTestFinished(() => {
    for (const session of sessions) store.removeSession(session);
    assert.equal(useSaveStatusStore.getState().status, "idle");
  });
  return { ...store, sessions, status: () => useSaveStatusStore.getState().status };
}

test("report and proposal saves retain the most urgent workbench status", () => {
  const {
    sessions: [report, proposal],
    updateSession,
    status,
  } = saveSessions("report", "proposal");
  updateSession(report, "dirty");
  updateSession(proposal, "idle");
  assert.equal(status(), "dirty");
  updateSession(proposal, "saving");
  assert.equal(status(), "saving");
  updateSession(report, "error");
  assert.equal(status(), "error");
  updateSession(proposal, "saved");
  assert.equal(status(), "error");
  updateSession(report, "saving");
  assert.equal(status(), "saving");
  updateSession(report, "saved");
  assert.equal(status(), "saved");
});

test("closing one editor preserves other sessions and ignores its late completion", () => {
  const {
    sessions: [report, proposal],
    updateSession,
    removeSession,
    status,
  } = saveSessions("report", "proposal");
  updateSession(report, "dirty");
  updateSession(proposal, "error");
  removeSession(proposal);
  assert.equal(status(), "dirty");
  updateSession(proposal, "saved");
  assert.equal(status(), "dirty");
  updateSession(proposal, "error");
  assert.equal(status(), "dirty");
  assert.equal(useSaveStatusStore.getState().sessions.has(proposal), false);
});

test("reopening the same resource starts a distinct session unaffected by the old request", () => {
  const {
    sessions: [previous, reopened],
    updateSession,
    removeSession,
    status,
  } = saveSessions("resource", "resource");
  updateSession(previous, "saving");
  removeSession(previous);
  assert.equal(status(), "idle");
  updateSession(reopened, "dirty");
  updateSession(previous, "error");
  assert.equal(status(), "dirty");
  assert.equal(useSaveStatusStore.getState().sessions.get(reopened), "dirty");
});

test("an idle metadata controller does not erase the child editor saved state", () => {
  const {
    sessions: [metadata, content],
    updateSession,
    removeSession,
    status,
  } = saveSessions("metadata", "content");
  updateSession(content, "saved");
  updateSession(metadata, "idle");
  assert.equal(status(), "saved");
  removeSession(content);
  assert.equal(status(), "idle");
});

test("mounted resource hooks isolate cleanup, resource switches and late save callbacks", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(dom.window.document.getElementById("root"));
  const handles = new Map();
  function Probe({ id }) {
    const session = useResourceSaveStatus(id);
    handles.set(id, session);
    return null;
  }
  function Editors({ report, proposal }) {
    return [
      createElement(Probe, { key: "report", id: report }),
      createElement(Probe, { key: "proposal", id: proposal }),
    ];
  }
  try {
    await act(() => root.render(createElement(Editors, { report: "report", proposal: "proposal" })));
    const lateProposalSave = handles.get("proposal").setStatus;
    await act(() => {
      handles.get("report").setStatus("dirty");
      lateProposalSave("saving");
    });
    assert.equal(useSaveStatusStore.getState().status, "saving");
    assert.equal(handles.get("report").status, "dirty");
    await act(() => root.render(createElement(Editors, { report: "report", proposal: null })));
    assert.equal(useSaveStatusStore.getState().status, "dirty");
    await act(() => lateProposalSave("error"));
    assert.equal(useSaveStatusStore.getState().status, "dirty");
    const lateReportSave = handles.get("report").setStatus;
    await act(() => root.render(createElement(Editors, { report: "other-report", proposal: null })));
    assert.equal(useSaveStatusStore.getState().status, "idle");
    await act(() => lateReportSave("saved"));
    assert.equal(useSaveStatusStore.getState().status, "idle");
    assert.equal(useSaveStatusStore.getState().sessions.size, 1);
  } finally {
    await act(() => root.unmount());
    assert.equal(useSaveStatusStore.getState().sessions.size, 0);
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    dom.window.close();
  }
});
