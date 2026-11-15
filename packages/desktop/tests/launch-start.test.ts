import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class WebContentsView {
    webContents = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      loadURL: async () => undefined,
      send: () => undefined,
      focus: () => undefined,
      close: () => this.webContents.emit("destroyed"),
    });
    setBounds() {
      return;
    }
    setBackgroundColor() {
      return;
    }
  }
  return {
    app: {},
    net: {},
    protocol: {},
    session: {},
    ipcMain: new EventEmitter(),
    WebContentsView,
    systemPreferences: { getAnimationSettings: () => ({ prefersReducedMotion: false }) },
  };
});

import { ipcMain } from "electron";
import { showLaunchScreen } from "../src/launchScreen";
import { alesiaTarget } from "../src/launchTerritory";

function createBareWindow() {
  let view: { webContents: EventEmitter } | undefined;
  const window = Object.assign(new EventEmitter(), {
    getContentSize: () => [1280, 800],
    isDestroyed: () => false,
    contentView: {
      addChildView: (created: NonNullable<typeof view>) => {
        view = created;
      },
      removeChildView() {
        return;
      },
    },
  });
  return { window, view: () => view! };
}

function createWindow() {
  let view: { webContents: EventEmitter };
  const window = Object.assign(new EventEmitter(), {
    getContentSize: () => [1280, 800],
    isDestroyed: () => false,
    contentView: {
      addChildView: (created: typeof view) => {
        view = created;
      },
      removeChildView() {
        return;
      },
    },
  });
  const screen = showLaunchScreen(window as never, alesiaTarget);
  return { screen, sender: () => view.webContents };
}

afterEach(() => {
  vi.useRealTimers();
  ipcMain.removeAllListeners();
});

/** @verifies-requirement HALL-TR-DSK-020 */
test("server preparation waits for an actual frame signal even beyond the former four-second guard", async () => {
  vi.useFakeTimers();
  const { screen, sender } = createWindow();
  const resolved = vi.fn();
  screen.started.then(resolved);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(resolved).not.toHaveBeenCalled();
  ipcMain.emit("hall-launch:started", { sender: new EventEmitter() });
  await vi.advanceTimersByTimeAsync(1);
  expect(resolved).not.toHaveBeenCalled();
  ipcMain.emit("hall-launch:started", { sender: sender() });
  await expect(screen.started).resolves.toBeUndefined();
  screen.remove();
});

test("a lost launch renderer rejects startup instead of releasing server preparation", async () => {
  const { screen, sender } = createWindow();
  const rejected = expect(screen.started).rejects.toThrow(/écran de lancement/);
  sender().emit("render-process-gone");
  await rejected;
  screen.remove();
});

test("an absent first frame times out as an error, never as permission to start", async () => {
  vi.useFakeTimers();
  const { screen } = createWindow();
  const rejected = expect(screen.started).rejects.toThrow(/première image/);
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  screen.remove();
});

/** @verifies-requirement HALL-TR-DSK-040 */
test("a launch screen without dataset resolves with the dataset chosen on its own page", async () => {
  const { window, view } = createBareWindow();
  const screen = showLaunchScreen(window as never, null);
  screen.started.catch(() => undefined);
  const contents = view().webContents;
  ipcMain.emit("hall-launch:choose", { sender: new EventEmitter() }, "alesia");
  ipcMain.emit("hall-launch:choose", { sender: contents }, "commune-inventee");
  ipcMain.emit("hall-launch:choose", { sender: contents }, "foncine-le-bas");
  await expect(screen.chosen).resolves.toBe("foncine-le-bas");
  screen.remove();
});

/** @verifies-requirement HALL-TR-DSK-040 */
test("a failure waits for the retry command of the launch page", async () => {
  const { window, view } = createBareWindow();
  const screen = showLaunchScreen(window as never, null);
  screen.started.catch(() => undefined);
  const contents = view().webContents;
  const retried = vi.fn();
  void screen.retried().then(retried);
  screen.fail("Le serveur embarqué de Hall s’est arrêté.");
  await Promise.resolve();
  expect(retried).not.toHaveBeenCalled();
  ipcMain.emit("hall-launch:retry", { sender: contents });
  await vi.waitFor(() => expect(retried).toHaveBeenCalled());
  screen.remove();
});
