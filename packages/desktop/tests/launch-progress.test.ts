// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import launchHtml from "../src/launch/index.html?raw";

vi.mock("../src/launch/geodata.js", () => ({ loadGeodata: () => new Promise(() => {}) }));
vi.mock("../src/launch/scene.js", () => ({ createLaunchScene: vi.fn() }));
vi.mock("../src/launch/reliefStage.js", () => ({ createReliefStage: vi.fn() }));

type Message =
  | { type: "plan"; phases: { phase: "database" | "server" | "dataset" | "interface"; expectedMs: number }[] }
  | { type: "phase"; phase: "database" | "server" | "dataset" | "interface"; status: "start" | "end" }
  | { type: "ready" };
let receive: (message: Message) => void;
let now = 0;
let frames: FrameRequestCallback[];
const open = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  document.open();
  document.write(launchHtml);
  document.close();
  now = 0;
  frames = [];
  open.mockClear();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  window.hallLaunch = {
    reportStarted: vi.fn(),
    reportMeasurements: vi.fn(),
    reportLeft: vi.fn(),
    open,
    onProgress: (listener) => {
      receive = listener;
    },
    onLeave: vi.fn(),
  };
  await import("../src/launch/main.js");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.hallLaunch;
  delete window.hallLaunchSnapshot;
});

function frame(at: number) {
  now = at;
  const callbacks = frames.splice(0);
  for (const callback of callbacks) callback(at);
}

/** @verifies-requirement HALL-TR-DSK-020 */
test("each real phase immediately changes its label and preparation keeps progressing", () => {
  receive({
    type: "plan",
    phases: [
      { phase: "database", expectedMs: 1000 },
      { phase: "server", expectedMs: 1000 },
      { phase: "dataset", expectedMs: 1000 },
      { phase: "interface", expectedMs: 1000 },
    ],
  });
  const loader = document.querySelector<HTMLElement>("[data-testid='launch-loader']")!;
  for (const [index, phase, label] of [
    [0, "database", "Préparation de la base"],
    [1, "server", "Démarrage du serveur"],
    [2, "dataset", "Chargement des données Alésia"],
    [3, "interface", "Chargement de l’interface"],
  ] as const) {
    receive({ type: "phase", phase, status: "start" });
    expect(document.querySelector("[data-testid='launch-step']")!.textContent).toBe(label);
    expect(document.querySelector("[data-testid='launch-step-count']")!.textContent).toBe(`${index + 1} sur 4`);
    expect(loader.dataset.active).toBe("true");
    const before = Number(loader.dataset.progress);
    frame(now + 300);
    expect(Number(loader.dataset.progress)).toBeGreaterThan(before);
    receive({ type: "phase", phase, status: "end" });
  }
});

test("ready immediately shows and enables opening before the title and intro finish", () => {
  document.documentElement.dataset.state = "playing";
  const button = document.querySelector<HTMLButtonElement>("[data-testid='launch-open']")!;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(button.hidden).toBe(true);
  expect(open).not.toHaveBeenCalled();
  now = 500;
  receive({ type: "ready" });
  expect(document.documentElement.dataset.brandComplete).toBeUndefined();
  expect(document.documentElement.dataset.state).toBe("playing");
  expect(button.hidden).toBe(false);
  expect(button.disabled).toBe(false);
  expect(button.getAttribute("aria-hidden")).toBe("false");
  expect(button.tabIndex).toBe(0);
  expect(document.querySelector("[data-testid='launch-footer']")!.hasAttribute("aria-hidden")).toBe(false);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(open).toHaveBeenCalledOnce();
});

test("waiting for a plan still exposes preparation activity without inventing completed work", () => {
  frame(100);
  const loader = document.querySelector<HTMLElement>("[data-testid='launch-loader']")!;
  expect(loader.dataset.active).toBe("true");
  expect(loader.getAttribute("aria-valuetext")).toBe("Préparation en cours");
  expect(loader.getAttribute("aria-valuenow")).toBe("0");
  expect(document.querySelector<HTMLButtonElement>("[data-testid='launch-open']")!.hidden).toBe(true);
});
