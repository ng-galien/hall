import { vi } from "vitest";

vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
vi.mock("../site-root", () => ({ publicFileUrl: (path: string) => path }));
