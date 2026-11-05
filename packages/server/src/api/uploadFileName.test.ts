import { describe, expect, it } from "vitest";
import { uploadFileName } from "./uploadFileName.js";

describe("uploadFileName", () => {
  it("decodes a UTF-8 name read as Latin-1", () => {
    const received = Buffer.from("TRUST — Corpus · référence.pdf", "utf8").toString("latin1");
    expect(uploadFileName(received)).toBe("TRUST — Corpus · référence.pdf");
  });

  it("keeps a name that is not UTF-8 read as Latin-1", () => {
    expect(uploadFileName("Château.pdf")).toBe("Château.pdf");
    expect(uploadFileName("Réservoirs — carte.geojson")).toBe("Réservoirs — carte.geojson");
  });
});
