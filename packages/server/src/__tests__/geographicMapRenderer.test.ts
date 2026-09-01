import type { GeographicResourceData } from "@hall/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeographicMapRenderer } from "../services/geographicMapRenderer.js";

describe("geographic map PDF rendering", () => {
  afterEach(() => vi.restoreAllMocks());

  it("embeds the GeoPF background and the persisted feature labels in one printable image", async () => {
    const background = Buffer.from("png-background");
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(background, { status: 200, headers: { "content-type": "image/png" } }));
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

  it("renders every Hall geometry without interactive map dependencies", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    const data: GeographicResourceData = {
      view: { kind: "extent", extent: [2.1, 48.1, 2.3, 48.2], zoom: 12 },
      layers: [
        { id: "ORTHOIMAGERY.ORTHOPHOTOS", visible: false, opacity: 1 },
        { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 0 },
      ],
      hallLayer: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "00000000-0000-4000-8000-000000000011",
            properties: {
              kind: "marker",
              visible: true,
              label: "Mairie & annexe <Nord>",
              style: { color: "#1b2a78", size: "large" },
            },
            geometry: { type: "Point", coordinates: [2.15, 48.15] },
          },
          {
            type: "Feature",
            id: "00000000-0000-4000-8000-000000000012",
            properties: {
              kind: "line",
              visible: true,
              label: "",
              style: { color: "#b42323", width: 3 },
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [2.11, 48.16],
                [2.19, 48.16],
              ],
            },
          },
          {
            type: "Feature",
            id: "00000000-0000-4000-8000-000000000013",
            properties: {
              kind: "area",
              visible: true,
              label: "Zone",
              style: {
                fillColor: "#a2620b",
                strokeColor: "#b42323",
                strokeWidth: 2,
                fillOpacity: 0.3,
              },
            },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [2.12, 48.12],
                  [2.18, 48.12],
                  [2.18, 48.18],
                ],
              ],
            },
          },
          {
            type: "Feature",
            id: "00000000-0000-4000-8000-000000000014",
            properties: {
              kind: "marker",
              visible: false,
              label: "Masqué",
              style: { color: "#1b2a78", size: "small" },
            },
            geometry: { type: "Point", coordinates: [2.25, 48.19] },
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

    const image = await createGeographicMapRenderer().render(data, 'Plan "Nord"');
    const svg = Buffer.from(image.split(",")[1], "base64").toString("utf8");

    expect(request).not.toHaveBeenCalled();
    expect(svg).toContain("<circle");
    expect(svg).toContain("<polyline");
    expect(svg).toContain("<polygon");
    expect(svg).toContain("Mairie &amp; annexe &lt;Nord&gt;");
    expect(svg).toContain('aria-label="Plan &quot;Nord&quot;"');
    expect(svg).toContain("Fond cartographique indisponible");
    expect(svg).not.toContain("Masqué");
  });

  it("degrades to the printable fallback when GeoPF rejects or cannot answer", async () => {
    const data: GeographicResourceData = {
      view: { kind: "center", center: [2.15, 48.15], zoom: 14 },
      layers: [{ id: "ORTHOIMAGERY.ORTHOPHOTOS", visible: true, opacity: 0.5 }],
      hallLayer: { type: "FeatureCollection", features: [] },
      provenance: {
        attribution: "IGN",
        license: "Licence Ouverte 2.0",
        metadataUrl: "https://example.test",
        configuredAt: "2026-08-31T10:00:00.000Z",
        sourceUpdatedAt: null,
      },
    };
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error("network unavailable"));

    for (const title of ["Service indisponible", "Réseau indisponible"]) {
      const image = await createGeographicMapRenderer().render(data, title);
      const svg = Buffer.from(image.split(",")[1], "base64").toString("utf8");
      expect(svg).toContain("Fond cartographique indisponible");
    }
    expect(request).toHaveBeenCalledTimes(2);
  });
});
