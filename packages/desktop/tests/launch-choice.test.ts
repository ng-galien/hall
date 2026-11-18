// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import launchHtml from "../src/launch/index.html?raw";

const loadGeodata = vi.hoisted(() => vi.fn());
vi.mock("../src/launch/geodata.js", () => ({ loadGeodata }));
vi.mock("../src/launch/scene.js", () => ({ createLaunchScene: vi.fn() }));
vi.mock("../src/launch/reliefStage.js", () => ({ createReliefStage: vi.fn() }));

const choose = vi.fn();
const retry = vi.fn();
const reportStarted = vi.fn();
let receive: (message: unknown) => void = () => undefined;
/** The page opened by the running test; the frames asked by an earlier page are never drawn. */
let page = 0;

async function openPage(presentation: string) {
  vi.resetModules();
  page += 1;
  const opened = page;
  history.replaceState(null, "", `/index.html?presentation=${presentation}`);
  document.open();
  document.write(launchHtml);
  document.close();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => {
      if (page === opened) callback(0);
    }, 0),
  );
  window.hallLaunch = {
    reportStarted,
    reportMeasurements: vi.fn(),
    reportLeft: vi.fn(),
    open: vi.fn(),
    choose,
    retry,
    onProgress: (listener) => {
      receive = listener as (message: unknown) => void;
    },
    onLeave: vi.fn(),
  };
  await import("../src/launch/main.js");
}

afterEach(() => {
  page += 1;
  vi.unstubAllGlobals();
  delete window.hallLaunch;
  delete window.hallLaunchSnapshot;
});

const testId = (id: string) => document.querySelector<HTMLElement>(`[data-testid='${id}']`)!;

beforeEach(() => {
  choose.mockClear();
  reportStarted.mockClear();
  retry.mockClear();
  loadGeodata.mockReset();
  loadGeodata.mockResolvedValue({
    projection: {},
    departements: [],
    communes: [],
    ancientCities: [],
    alesiaFocus: [0, 0],
  });
});

/** @verifies-requirement HALL-TR-DSK-040 */
test("the choice offers Foncine-le-Bas first, then Alésia, sends the chosen dataset and names its commune", async () => {
  await openPage("choice");
  await vi.waitFor(() => expect(testId("launch-choice").hidden).toBe(false));
  expect(testId("launch-footer").hidden).toBe(true);
  expect(testId("launch-place").hidden).toBe(true);
  const buttons = [...testId("launch-choice").querySelectorAll<HTMLButtonElement>("button[data-dataset]")];
  expect(buttons.map((button) => button.dataset.dataset)).toEqual(["foncine-le-bas", "alesia"]);
  expect(document.activeElement).toBe(buttons[0]);
  expect(testId("launch-choice-foncine-le-bas").textContent?.replace(/\s+/g, " ").trim()).toBe(
    "Foncine-le-Bas, Jura Démonstration dans une vraie commune de France. Données de démonstration : réalistes, mais fictives. Charger Foncine-le-Bas",
  );
  testId("launch-choose-foncine-le-bas").click();
  testId("launch-choose-alesia").click();
  expect(choose.mock.calls).toEqual([["foncine-le-bas"]]);
  expect(testId("launch-choice").hidden).toBe(true);
  expect(testId("launch-footer").hidden).toBe(false);
  expect(testId("launch-place").textContent).toBe("Foncine-le-Bas, Jura");
  expect(document.documentElement.dataset.commune).toBe("39227");
});

/** @verifies-requirement HALL-TR-DSK-040 */
test("a recorded Foncine-le-Bas opens without choice and names the commune", async () => {
  await openPage("foncine-le-bas");
  expect(testId("launch-place").textContent).toBe("Foncine-le-Bas, Jura");
  expect(testId("launch-note").textContent).toBe(
    "Démonstration dans une vraie commune de France. Données de démonstration : réalistes, mais fictives.",
  );
  expect(testId("launch-choice").hidden).toBe(true);
  expect(testId("launch-story-list").hidden).toBe(true);
  await vi.waitFor(() => expect(reportStarted).toHaveBeenCalled());
});

/** @verifies-requirement HALL-TR-DSK-040 */
test("a preparation failure replaces the progress with its message and a retry command", async () => {
  await openPage("foncine-le-bas");
  receive({ type: "failed", message: "Le serveur embarqué de Hall s’est arrêté." });
  expect(testId("launch-failure").hidden).toBe(false);
  expect(testId("launch-failure-message").textContent).toBe("Le serveur embarqué de Hall s’est arrêté.");
  testId("launch-retry").click();
  expect(retry).toHaveBeenCalledTimes(1);
  expect(testId("launch-failure").hidden).toBe(true);
});
