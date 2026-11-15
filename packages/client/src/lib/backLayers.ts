import { useEffect, useRef, useState } from "react";

/**
 * The back command of the phone, the back gesture and the back button of the browser close what lies over the screen
 * before they leave the screen. Each open layer (a panel, a window, a menu, a list of choices, a writing mode) adds one
 * entry to the history of the browser, at the same address: going back from it closes that layer only, and going
 * forward to it never opens it again. The router never sees these entries: a navigation started from a covered screen
 * takes their place, and a return to the previous screen started by the application passes over them.
 */

interface Layer {
  readonly id: string;
  open: boolean;
  /** The back command asked the layer to close; a layer still open afterwards takes an entry again. */
  closedByBack: boolean;
  close(): void;
}

type EntryState = { key?: unknown; idx?: unknown; hallLayer?: string } & Record<string, unknown>;

type HistoryWrite = (state: unknown, unused: string, url?: string | URL | null) => void;

interface Traversal {
  /** The arrival is the end of a move of the history made for the layers: it closes nothing. */
  quiet: boolean;
  after: Array<() => void>;
  timer: number;
}

interface BackLayers {
  nextId(): string;
  open(layer: Layer): void;
  close(layer: Layer): void;
}

const storeKey = "__hallBackLayers";
/** A move of the history that does not arrive is abandoned after this delay. */
const traversalTimeoutMs = 1000;

function sameEntry(left: EntryState | null, right: EntryState | null): boolean {
  return left?.key === right?.key && left?.idx === right?.idx;
}

function createBackLayers(): BackLayers {
  const history = window.history;
  const native = {
    push: history.pushState.bind(history) as HistoryWrite,
    replace: history.replaceState.bind(history) as HistoryWrite,
    go: history.go.bind(history),
  };
  const prefix = Math.random().toString(36).slice(2, 8);
  let counter = 0;
  /** The layers that have an entry above the entry of the screen, in the order of the history. */
  let entries: Layer[] = [];
  /** The entry of the screen under the layers. */
  let base: EntryState | null = null;
  /** The last entry the router wrote while a layer covered the screen; the screen entry takes it back. */
  let routerWrite: { state: EntryState; url?: string | URL | null } | null = null;
  let current = history.state as EntryState | null;
  let releaseTimer = 0;
  let traversal: Traversal | null = null;

  const state = () => history.state as EntryState | null;
  const onTopLayerEntry = () => {
    const top = entries.at(-1);
    return top !== undefined && state()?.hallLayer === top.id;
  };
  const forget = () => {
    entries = [];
    base = null;
    routerWrite = null;
    window.clearTimeout(releaseTimer);
    releaseTimer = 0;
  };
  const write = (method: HistoryWrite, next: EntryState, url?: string | URL | null) => {
    method(next, "", url);
    current = next;
  };

  function traverse(delta: number, quiet: boolean, after?: () => void) {
    if (traversal) {
      traversal.after.push(() => traverse(delta, quiet, after));
      return;
    }
    traversal = { quiet, after: after ? [after] : [], timer: window.setTimeout(endTraversal, traversalTimeoutMs) };
    native.go(delta);
  }

  function endTraversal() {
    const ended = traversal;
    if (!ended) return;
    window.clearTimeout(ended.timer);
    traversal = null;
    for (const run of ended.after) run();
  }

  function release() {
    releaseTimer = 0;
    if (traversal) {
      traversal.after.push(release);
      return;
    }
    let closed = 0;
    while (closed < entries.length && !entries[entries.length - 1 - closed].open) closed += 1;
    if (!closed) return;
    const onTop = onTopLayerEntry();
    entries.splice(entries.length - closed);
    if (onTop) traverse(-closed, false);
  }

  function open(layer: Layer) {
    if (traversal) {
      traversal.after.push(() => {
        if (layer.open && !entries.includes(layer)) open(layer);
      });
      return;
    }
    const top = entries.at(-1);
    const shown = state();
    if (top && !top.open && shown?.hallLayer === top.id) {
      entries[entries.length - 1] = layer;
      write(native.replace, { ...shown, hallLayer: layer.id });
      return;
    }
    if (!entries.length) base = shown;
    entries.push(layer);
    write(native.push, { ...shown, hallLayer: layer.id });
  }

  function close(layer: Layer) {
    layer.open = false;
    if (!entries.includes(layer) || releaseTimer) return;
    releaseTimer = window.setTimeout(release, 0);
  }

  function onPopState(event: PopStateEvent) {
    const target = (event.state ?? null) as EntryState | null;
    const previous = current;
    current = target;
    const arrived = traversal;
    if (arrived) {
      window.clearTimeout(arrived.timer);
      traversal = null;
    }
    const leavesOrReachesLayer = target?.hallLayer !== undefined || previous?.hallLayer !== undefined;
    const sameScreen =
      leavesOrReachesLayer && (sameEntry(target, previous) || (entries.length > 0 && sameEntry(target, base)));
    if (!sameScreen) {
      forget();
    } else {
      event.stopImmediatePropagation();
      if (!arrived?.quiet) arrive(target);
    }
    for (const run of arrived?.after ?? []) run();
  }

  function arrive(target: EntryState | null) {
    const id = target?.hallLayer;
    const index = id === undefined ? -1 : entries.findIndex((layer) => layer.id === id);
    if (id !== undefined && index === -1) {
      traverse(-1, false);
      return;
    }
    const above = entries.splice(index + 1).reverse();
    for (const layer of above) {
      if (!layer.open) continue;
      layer.closedByBack = true;
      layer.close();
    }
    if (index >= 0) {
      if (!entries[index].open) traverse(-1, false);
      return;
    }
    if (routerWrite && !sameEntry(target, routerWrite.state)) write(native.replace, routerWrite.state, routerWrite.url);
    base = null;
    routerWrite = null;
  }

  history.pushState = (next: unknown, unused: string, url?: string | URL | null) => {
    if (traversal) {
      traversal.after.push(() => history.pushState(next, unused, url));
      return;
    }
    if (!onTopLayerEntry()) {
      if (entries.length) forget();
      write(native.push, next as EntryState, url);
      return;
    }
    const covered = entries.length;
    forget();
    const replace = () => write(native.replace, next as EntryState, url);
    if (covered === 1) replace();
    else traverse(1 - covered, true, replace);
  };

  history.replaceState = (next: unknown, unused: string, url?: string | URL | null) => {
    if (traversal) {
      traversal.after.push(() => history.replaceState(next, unused, url));
      return;
    }
    const shown = state();
    if (shown?.hallLayer !== undefined && entries.some((layer) => layer.id === shown.hallLayer)) {
      routerWrite = { state: next as EntryState, url };
      write(native.replace, { ...(next as EntryState), hallLayer: shown.hallLayer }, url);
      return;
    }
    write(native.replace, next as EntryState, url);
  };

  /* The router goes back by history.go, for the arrow of the header: that return leaves the screen, its layers with it.
     history.back stays the back command of the browser and of the phone. */
  history.go = (delta = 0) => {
    if (traversal) {
      traversal.after.push(() => history.go(delta));
      return;
    }
    if (delta < 0 && onTopLayerEntry()) {
      const covered = entries.length;
      forget();
      native.go(delta - covered);
      return;
    }
    native.go(delta);
  };

  window.addEventListener("popstate", onPopState);
  if (state()?.hallLayer !== undefined) traverse(-1, true);

  return {
    nextId: () => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
    open,
    close,
  };
}

/**
 * Installs the layers before the router listens to the history, so that the entries of the layers never reach it.
 * The installation is kept on the window: a module loaded again reuses it.
 */
export function startBackLayers(): BackLayers {
  const host = window as unknown as Record<string, BackLayers | undefined>;
  host[storeKey] ??= createBackLayers();
  return host[storeKey];
}

/** While `open`, the back command calls `close` instead of leaving the screen. */
export function useBackLayer(open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  const layer = useRef<Layer | null>(null);
  useEffect(() => {
    if (!open) return;
    const layers = startBackLayers();
    const opened: Layer = { id: layers.nextId(), open: true, closedByBack: false, close: () => closeRef.current() };
    layer.current = opened;
    layers.open(opened);
    return () => {
      layer.current = null;
      layers.close(opened);
    };
  }, [open]);
  useEffect(() => {
    const opened = layer.current;
    if (!opened?.closedByBack) return;
    opened.closedByBack = false;
    startBackLayers().open(opened);
  });
}

/** The open state of an overlay primitive, controlled or not, closed by the back command. */
export function useBackClosable({
  open,
  defaultOpen,
  onOpenChange,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?(open: boolean): void;
}): { open: boolean; onOpenChange(open: boolean): void } {
  const [own, setOwn] = useState(defaultOpen ?? false);
  const shown = open ?? own;
  const change = (next: boolean) => {
    if (open === undefined) setOwn(next);
    onOpenChange?.(next);
  };
  useBackLayer(shown, () => change(false));
  return { open: shown, onOpenChange: change };
}
