const listeners = [];
let started = false;
const phases = [
  { phase: "database", expectedMs: 1200 },
  { phase: "server", expectedMs: 800 },
  { phase: "dataset", expectedMs: 20000 },
  { phase: "interface", expectedMs: 900 },
];
const emit = (message) => listeners.forEach((listener) => listener(message));
const start = () => {
  if (started) return;
  started = true;
  let elapsed = 0;
  for (const planned of phases) {
    const phase = planned.phase;
    setTimeout(() => emit({ type: "phase", phase, status: "start" }), elapsed);
    elapsed += planned.expectedMs;
    setTimeout(() => emit({ type: "phase", phase, status: "end" }), elapsed);
  }
  setTimeout(() => emit({ type: "ready" }), elapsed);
};
window.hallLaunch = {
  reportStarted: start,
  reportMeasurements() {},
  reportLeft() {},
  onLeave() {},
  onProgress(listener) {
    listeners.push(listener);
    listener({ type: "plan", phases });
  },
  open() {},
};
