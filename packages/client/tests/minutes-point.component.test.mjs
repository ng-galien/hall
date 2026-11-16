// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({
  useI18n: () => ({
    t: (key, values) => (values ? `${key} ${Object.values(values).join(" ")}` : key),
    formatNumber: (value) => String(value),
    formatDate: () => "14 novembre",
  }),
}));
vi.mock("../src/shell/usePhoneLayout", () => ({ usePhoneLayout: () => true }));
vi.mock("../src/components/editor/MarkdownEditor", () => ({
  MarkdownEditor: ({ testId, markdown, readOnly, phoneWriting }) =>
    h("div", {
      "data-testid": testId,
      "data-markdown": markdown,
      "data-read-only": String(Boolean(readOnly)),
      "data-phone-writing": String(Boolean(phoneWriting)),
    }),
}));
vi.mock("../src/components/MarkdownView", () => ({
  MarkdownView: ({ markdown }) => h("div", { "data-view": "markdown" }, markdown),
}));
vi.mock("../src/pages/minutes/MinutesFacts", () => ({ MinutesAgendaFacts: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
  TooltipContent: () => null,
}));

import { MinutesPhonePoint, MinutesPoint, MinutesPointWriting } from "../src/pages/minutes/MinutesPoint.tsx";

const item = (overrides = {}) => ({
  id: "point-1",
  position: 1,
  agendaNumber: 1,
  introducedAt: null,
  title: "Budget",
  report: "",
  proposal: null,
  discussionSummary: "Notes prises en séance",
  kind: "councilDecisionProposal",
  startedAt: null,
  completedAt: null,
  adjournedAt: null,
  ...overrides,
});

let root;
let host;
async function render(element) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(element));
  return host;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

const point = (props) =>
  h(MinutesPoint, {
    item: item(),
    ballots: [],
    editorialText: "Rédaction",
    saveStatus: "idle",
    canEdit: true,
    generating: false,
    showSourceNotes: false,
    onEdit: () => undefined,
    onBlur: () => undefined,
    ...props,
  });

// @verifies-requirement HALL-FR-MIN-250
test("a point shows its text directly, without tabs, and its meeting notes only when they are shown", async () => {
  const view = await render(point());
  assert.equal(view.querySelector('[role="tablist"]'), null);
  assert.ok(view.querySelector('[data-testid="minutes-section-point-1"]'), "the editor is open");
  assert.equal(view.querySelector('[data-testid="minutes-source-notes-point-1"]'), null);
  assert.ok(view.querySelector('[data-testid="minutes-section-save-status-point-1"]'));
  assert.ok(view.querySelector('[data-testid="minutes-restore-source-point-1"]'), "the text differs from the note");
  await act(async () => root.render(point({ showSourceNotes: true })));
  const notes = view.querySelector('[data-testid="minutes-source-notes-point-1"]');
  assert.ok(notes);
  assert.match(notes.textContent, /minutes\.sourceNotes/);
  assert.match(notes.textContent, /Notes prises en séance/);
});

// @verifies-requirement HALL-FR-MIN-250
test("a point without note says so, a reader sees the rendered text, and a point added in session carries its mark", async () => {
  const view = await render(
    point({
      item: item({ discussionSummary: "", introducedAt: "2026-11-14T20:00:00+01:00" }),
      canEdit: false,
      editorialText: "",
      showSourceNotes: true,
    }),
  );
  assert.equal(view.querySelector('[data-testid="minutes-section-point-1"]'), null, "no editor for a reader");
  assert.equal(view.querySelector('[data-testid="minutes-section-save-status-point-1"]'), null);
  assert.match(
    view.querySelector('[data-testid="minutes-source-notes-point-1"]').textContent,
    /minutes\.noSourceNotes/,
  );
  assert.match(
    view.querySelector('[data-testid="minutes-editorial-text-point-1"]').textContent,
    /minutes\.noEditorialText/,
  );
  const mark = view.querySelector('[data-testid="minutes-point-added-point-1"]');
  assert.equal(mark.className, "list-row-status");
  assert.equal(mark.textContent, "minutes.addedDuringMeeting 14 novembre");
});

// @verifies-requirement HALL-FR-MIN-250
test("on a phone a point is read without editor and offers its own writing command to whoever may write it", async () => {
  let started = 0;
  const props = {
    item: item(),
    ballots: [],
    editorialText: "Rédaction",
    canEdit: true,
    onStartWriting: () => {
      started += 1;
    },
  };
  const view = await render(h(MinutesPhonePoint, props));
  assert.equal(view.querySelector('[data-testid="minutes-section-point-1"]'), null);
  assert.match(view.querySelector('[data-testid="minutes-editorial-text-point-1"]').textContent, /Rédaction/);
  const edit = view.querySelector('[data-testid="minutes-point-edit-point-1"]');
  assert.equal(edit.getAttribute("aria-label"), "minutes.editPoint 1");
  await act(async () => edit.click());
  assert.equal(started, 1);
  await act(async () => root.render(h(MinutesPhonePoint, { ...props, canEdit: false })));
  assert.equal(view.querySelector('[data-testid="minutes-point-edit-point-1"]'), null);
});

// @verifies-requirement HALL-FR-MIN-250
test("the writing screen of a point shows its notes on demand and moves to the previous and next points", async () => {
  const moves = [];
  const second = item({ id: "point-2", agendaNumber: 2, title: "Voirie" });
  const props = {
    item: item(),
    editorialText: "Rédaction",
    saveStatus: "saved",
    generating: false,
    previous: null,
    next: second,
    onEdit: () => undefined,
    onBlur: () => undefined,
    onMove: (target) => moves.push(target.id),
  };
  const view = await render(h(MinutesPointWriting, props));
  const editor = view.querySelector('[data-testid="minutes-section-point-1"]');
  assert.equal(editor.getAttribute("data-phone-writing"), "true");
  assert.equal(editor.getAttribute("data-read-only"), "false");
  assert.equal(view.querySelector('[data-testid="minutes-source-notes-point-1"]'), null);
  const toggle = view.querySelector('[data-testid="minutes-point-writing-notes"]');
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  await act(async () => toggle.click());
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.ok(view.querySelector('[data-testid="minutes-source-notes-point-1"]'));
  assert.equal(view.querySelector('[data-testid="minutes-point-writing-previous"]').disabled, true);
  await act(async () => view.querySelector('[data-testid="minutes-point-writing-next"]').click());
  assert.deepEqual(moves, ["point-2"]);
  await act(async () => root.render(h(MinutesPointWriting, { ...props, generating: true })));
  assert.equal(view.querySelector('[data-testid="minutes-section-point-1"]').getAttribute("data-read-only"), "true");
  assert.equal(view.querySelector('[data-testid="minutes-restore-source-point-1"]').disabled, true);
});
