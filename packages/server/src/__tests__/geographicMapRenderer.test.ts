import type { GeographicResourceData } from "@hall/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeographicMapRenderer } from "../services/geographicMapRenderer.js";

describe("geographic map PDF rendering", () => {
  afterEach(() => vi.restoreAllMocks());

  it("embeds the GeoPF background and the persisted feature labels in one printable image", async () => {
    const background = Buffer.from("png-background");
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(background, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const data: GeographicResourceData = {
      view: { kind: "center", center: [2.15, 48.15], zoom: 14 },
      layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
      hallLayer: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "00000000-0000-4000-8000-000000000001",
            properties: {
              kind: "area",
              visible: true,
              label: "Zone du cimetière",
              style: {
                fillColor: "#24439b",
                strokeColor: "#102a83",
                strokeWidth: 2,
                fillOpacity: 0.2,
              },
            },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [2.14, 48.14],
                  [2.16, 48.14],
                  [2.16, 48.16],
                  [2.14, 48.14],
                ],
              ],
            },
          },
        ],
      },
      provenance: {
        attribution: "IGN",
        license: "Licence Ouverte 2.0",
        metadataUrl: "https://example.test",
        configuredAt: "2026-08-31T10:00:00.000Z",
        sourceUpdatedAt: null,
      },
    };

    const image = await createGeographicMapRenderer().render(data, "Plan");
    const svg = Buffer.from(image.split(",")[1], "base64").toString("utf8");

    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0][0])).toContain("LAYERS=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2");
    expect(svg).toContain(`data:image/png;base64,${background.toString("base64")}`);
    expect(svg).toContain("Zone du cimetière");
    expect(svg).toContain("#102a83");
  });
});
