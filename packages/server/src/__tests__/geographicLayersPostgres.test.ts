if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL is required; use the isolated test:postgres entry point");

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { geographicLayerFeatureCollectionSchema, resourceDetailSchema, type SirenAction } from "@hall/api-contract";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { decodeCouncilBusinessBundle } from "../services/councilBusinessBundleArchive.js";
import { createPostgresHttpTestServer, domainBody } from "./testServer.js";

const postgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const fixture = readFileSync(
  fileURLToPath(new URL("../../../client/e2e/fixtures/geographic-layer-parcels.geojson", import.meta.url)),
);
const cadastreFixture = readFileSync(
  fileURLToPath(new URL("../../../client/e2e/fixtures/geographic-layer-cadastre.geojson", import.meta.url)),
);
const administrator = { email: "admin@example.fr", displayName: "Administration", password: "Mot-de-passe-demo-2026!" };
const reader = { email: "lecture@example.fr", password: "Mot-de-passe-lecture-2026!" };
const contributor = { email: "contribution@example.fr", password: "Mot-de-passe-contribution-2026!" };

function action(body: { actions?: SirenAction[] }, name: string): SirenAction {
  const found = body.actions?.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing Siren action ${name}`);
  return found;
}

postgres("geographic layers", () => {
  // @verifies-requirement HALL-FR-DOC-310
  // @verifies-requirement HALL-FR-DOC-320
  // @verifies-requirement HALL-FR-DOC-330
  it("imports a GeoJSON layer from a map, links it, serves its features with an ETag and protects it while linked", async () => {
    const { agent } = await createPostgresHttpTestServer();
    const map = await agent
      .post("/api/resources")
      .send({ kind: "geographic", path: "Cartes", name: "Plan" })
      .expect(201);
    const mapId = domainBody<{ id: string }>(map).id;
    const importAction = action(map.body, "resource.import-geographic-layer");
    expect(importAction).toMatchObject({ method: "POST", type: "multipart/form-data" });
    expect(importAction.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "path", value: "Cartes" }),
        expect.objectContaining({ name: "geographicResourceId", value: mapId }),
      ]),
    );

    const refused = await agent
      .post(importAction.href)
      .field("geographicResourceId", mapId)
      .attach(
        "file",
        Buffer.from(
          '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[700000,6600000]}}]}',
        ),
        "lambert.geojson",
      )
      .expect(422);
    expect(refused.body).toMatchObject({
      code: "geographic_layer_invalid",
      errors: [{ code: "coordinatesOutOfRange", featureIndex: 0, path: "features[0].geometry.coordinates" }],
    });

    const created = await agent
      .post(importAction.href)
      .field("name", "Parcelles d'essai")
      .field("path", "Cartes")
      .field("geographicResourceId", mapId)
      .attach("file", fixture, "geographic-layer-parcels.geojson")
      .expect(201);
    const layer = resourceDetailSchema.parse(domainBody(created));
    if (layer.kind !== "geographicLayer") throw new Error("Expected a geographic layer");
    expect(layer).toMatchObject({ path: "Cartes", name: "Parcelles d'essai", featureCount: 4 });
    expect(layer.source).toMatchObject({ format: "geojson", fileName: "geographic-layer-parcels.geojson" });
    expect(layer.extent).toEqual([4.5, 47.5, 4.508, 47.5035]);
    const featuresLink = (created.body.links as Array<{ rel: string[]; href: string; type: string }>).find((link) =>
      link.rel.includes("features"),
    );
    expect(featuresLink).toMatchObject({ type: "application/geo+json" });

    const opened = resourceDetailSchema.parse(domainBody(await agent.get(`/api/resources/${mapId}`).expect(200)));
    if (opened.kind !== "geographic") throw new Error("Expected a map");
    expect(opened.overlays).toEqual([
      expect.objectContaining({
        layerId: layer.id,
        name: "Parcelles d'essai",
        featureCount: 4,
        visible: true,
        position: 0,
      }),
    ]);

    const features = await agent.get(featuresLink!.href).set("Accept-Encoding", "gzip").expect(200);
    expect(features.headers["content-type"]).toContain("application/geo+json");
    expect(features.headers["content-encoding"]).toBe("gzip");
    const collection = geographicLayerFeatureCollectionSchema.parse(JSON.parse(features.text));
    expect(collection.features.map((feature) => feature.sourceId)).toEqual([
      "essai-1",
      "essai-2",
      "essai-3",
      "essai-4",
    ]);
    expect(collection.features[3]?.properties).toEqual({ nom: "Borne d'essai" });
    const gzipEtag = features.headers.etag;
    expect(gzipEtag).toBe(`"${layer.id}.1.gz"`);
    await agent.get(featuresLink!.href).set("Accept-Encoding", "gzip").set("If-None-Match", gzipEtag!).expect(304);
    const plain = await agent.get(featuresLink!.href).set("Accept-Encoding", "identity").expect(200);
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.headers.etag).toBe(`"${layer.id}.1"`);
    expect(JSON.parse(plain.text)).toEqual(collection);
    await agent.get(featuresLink!.href).set("Accept-Encoding", "identity").set("If-None-Match", gzipEtag!).expect(200);

    const linkAction = action(
      (await agent.get(`/api/resources/${mapId}`).expect(200)).body,
      "resource.link-geographic-layer",
    );
    const hidden = resourceDetailSchema.parse(
      domainBody(await agent.put(linkAction.href).send({ layerId: layer.id, visible: false }).expect(200)),
    );
    expect(hidden.kind === "geographic" && hidden.overlays[0]?.visible).toBe(false);

    const layerRepresentation = (await agent.get(`/api/resources/${layer.id}`).expect(200)).body as {
      actions?: SirenAction[];
    };
    expect(layerRepresentation.actions?.map(({ name }) => name)).not.toContain("resource.delete");
    expect((await agent.delete(`/api/resources/${layer.id}`).expect(409)).body.code).toBe("conflict");

    const listed = await agent.get("/api/resources/geographic-layers").expect(200);
    expect(domainBody<Array<{ id: string }>>(listed).map(({ id }) => id)).toEqual([layer.id]);
    expect(listed.body.actions?.map(({ name }: SirenAction) => name)).toEqual(["resource.import-geographic-layer"]);

    const unlinkAction = action(
      (await agent.get(`/api/resources/${mapId}`).expect(200)).body,
      "resource.unlink-geographic-layer",
    );
    const unlinked = resourceDetailSchema.parse(
      domainBody(await agent.post(unlinkAction.href).send({ layerId: layer.id }).expect(200)),
    );
    expect(unlinked.kind === "geographic" && unlinked.overlays).toEqual([]);
    await agent.delete(`/api/resources/${layer.id}`).expect(204);
  });

  // @verifies-requirement HALL-FR-DOC-310
  // @verifies-requirement HALL-FR-DOC-330
  it("lets a reader read layers and features but not import or link them", async () => {
    const { agent: administration, url } = await createPostgresHttpTestServer({ devAutoLogin: false });
    await administration.post("/api/auth/bootstrap").send(administrator).expect(201);
    await administration.post("/api/auth/login").send(administrator).expect(200);
    await administration
      .post("/api/users")
      .send({ ...reader, displayName: "Lecture seule", roles: ["reader"] })
      .expect(201);
    const map = await administration
      .post("/api/resources")
      .send({ kind: "geographic", path: "", name: "Plan" })
      .expect(201);
    const mapId = domainBody<{ id: string }>(map).id;
    const created = await administration
      .post("/api/resources/geographic-layers/import")
      .field("geographicResourceId", mapId)
      .attach("file", fixture, "geographic-layer-parcels.geojson")
      .expect(201);
    const layerId = domainBody<{ id: string; name: string }>(created).id;
    expect(domainBody<{ name: string }>(created).name).toBe("geographic-layer-parcels");

    const readerAgent = request.agent(url);
    await readerAgent.post("/api/auth/login").send(reader).expect(200);
    const readerMap = await readerAgent.get(`/api/resources/${mapId}`).expect(200);
    expect(readerMap.body.properties.overlays).toHaveLength(1);
    expect((readerMap.body.actions ?? []).map(({ name }: SirenAction) => name)).not.toContain(
      "resource.link-geographic-layer",
    );
    await readerAgent.get(`/api/resources/${layerId}/features`).expect(200);
    await readerAgent.get("/api/resources/geographic-layers").expect(200);
    await readerAgent
      .post("/api/resources/geographic-layers/import")
      .attach("file", fixture, "geographic-layer-parcels.geojson")
      .expect(403);
    await readerAgent.put(`/api/resources/${mapId}/overlays`).send({ layerId, visible: false }).expect(403);
    await readerAgent.post(`/api/resources/${mapId}/overlays/unlink`).send({ layerId }).expect(403);
  });

  // @verifies-requirement HALL-FR-DOC-350
  it("offers map editing and layer import, link and unlink to a contributor, not renaming or deletion", async () => {
    const { agent: administration, url } = await createPostgresHttpTestServer({ devAutoLogin: false });
    await administration.post("/api/auth/bootstrap").send(administrator).expect(201);
    await administration.post("/api/auth/login").send(administrator).expect(200);
    await administration
      .post("/api/users")
      .send({ ...contributor, displayName: "Contribution", roles: ["contributor"] })
      .expect(201);
    const map = await administration
      .post("/api/resources")
      .send({ kind: "geographic", path: "", name: "Plan" })
      .expect(201);
    const mapId = domainBody<{ id: string }>(map).id;

    const contributorAgent = request.agent(url);
    await contributorAgent.post("/api/auth/login").send(contributor).expect(200);
    const opened = await contributorAgent.get(`/api/resources/${mapId}`).expect(200);
    expect((opened.body.actions as SirenAction[]).map(({ name }) => name)).toEqual([
      "resource.update-content",
      "resource.create-geographic-feature-note",
      "resource.import-geographic-layer",
      "resource.link-geographic-layer",
      "resource.unlink-geographic-layer",
    ]);
    const listed = await contributorAgent.get("/api/resources/geographic-layers").expect(200);
    expect((listed.body.actions as SirenAction[]).map(({ name }) => name)).toEqual([
      "resource.import-geographic-layer",
    ]);
    const created = await contributorAgent
      .post(action(opened.body, "resource.import-geographic-layer").href)
      .field("geographicResourceId", mapId)
      .attach("file", fixture, "geographic-layer-parcels.geojson")
      .expect(201);
    const layerId = domainBody<{ id: string }>(created).id;
    expect(((created.body.actions ?? []) as SirenAction[]).map(({ name }) => name)).toEqual([
      "resource.create-geographic-feature-note",
    ]);
    const hidden = await contributorAgent
      .put(action(opened.body, "resource.link-geographic-layer").href)
      .send({ layerId, visible: false })
      .expect(200);
    expect(hidden.body.properties.overlays[0].visible).toBe(false);
    await contributorAgent
      .post(action(opened.body, "resource.unlink-geographic-layer").href)
      .send({ layerId })
      .expect(200);
  });

  // @verifies-requirement HALL-FR-DOC-330
  // @verifies-requirement HALL-FR-DOC-430
  it("carries a map, its linked layer and the link through a council business bundle", async () => {
    const source = await createPostgresHttpTestServer();
    const business = domainBody<{ id: string }>(
      await source.agent
        .post("/api/council-business")
        .send({ path: "Travaux", name: "Captage", reportName: "Rapport", reportContent: "État du captage" })
        .expect(201),
    );
    const map = await source.agent
      .post("/api/resources")
      .send({ kind: "geographic", path: "Travaux/Captage", name: "Périmètre", councilBusinessId: business.id })
      .expect(201);
    const mapId = domainBody<{ id: string }>(map).id;
    const layer = await source.agent
      .post("/api/resources/geographic-layers/import")
      .field("path", "Cartes")
      .field("name", "Parcelles d'essai")
      .field("geographicResourceId", mapId)
      .attach("file", fixture, "geographic-layer-parcels.geojson")
      .expect(201);
    const layerId = domainBody<{ id: string }>(layer).id;
    await source.agent
      .put(`/api/resources/${mapId}/overlays`)
      .send({ layerId, visible: false, opacity: 0.6 })
      .expect(200);
    const mapRepresentation = (await source.agent.get(`/api/resources/${mapId}`).expect(200)).body;
    const drawingId = crypto.randomUUID();
    await source.agent
      .put(action(mapRepresentation, "resource.update-content").href)
      .send({
        kind: "geographic",
        expectedVersion: mapRepresentation.properties.version,
        document: {
          ...mapRepresentation.properties.document,
          hallLayer: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                id: drawingId,
                properties: {
                  kind: "marker",
                  visible: true,
                  label: "Chêne",
                  style: { color: "#2255aa", size: "medium" },
                },
                geometry: { type: "Point", coordinates: [4.5, 47.6] },
              },
            ],
          },
        },
      })
      .expect(200);
    const drawingNote = await source.agent
      .post(`/api/resources/${mapId}/feature-notes`)
      .send({ elementId: drawingId })
      .expect(201);
    await source.agent
      .put(`/api/resources/${drawingNote.body.properties.noteId}/content`)
      .send({ kind: "text", expectedVersion: 1, content: "Chêne à conserver." })
      .expect(200);
    const exported = await source.agent
      .get(`/api/council-business/${business.id}/bundle?firstName=Epona&lastName=Arverna`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const bundle = decodeCouncilBusinessBundle(exported.body as Buffer);
    const carried = bundle.manifest.resources.find(({ data }) => data.kind === "geographicLayer");
    expect(carried?.data).toMatchObject({ id: layerId, path: "Cartes", featureCount: 4 });
    expect(bundle.manifest.business.resourceSourceIds).toEqual([mapId]);
    expect(bundle.manifest.geographicFeatureNotes).toEqual([
      {
        noteSourceId: drawingNote.body.properties.noteId,
        subjectKind: "drawnElement",
        layerSourceId: null,
        mapSourceId: mapId,
        key: drawingId,
      },
    ]);

    const target = await createPostgresHttpTestServer();
    const imported = await target.agent
      .post("/api/council-business/import-bundle")
      .attach("file", exported.body as Buffer, "captage.hallbundle")
      .expect(201);
    const [importedMapId] = (
      await target.agent.get(`/api/council-business/${domainBody<{ id: string }>(imported).id}/resources`).expect(200)
    ).body.entities.map((entity: { properties: { resourceId: string } }) => entity.properties.resourceId);
    const importedMap = resourceDetailSchema.parse(
      domainBody(await target.agent.get(`/api/resources/${importedMapId}`)),
    );
    if (importedMap.kind !== "geographic") throw new Error("Expected the imported map");
    expect(importedMap.overlays).toEqual([
      expect.objectContaining({
        name: "Parcelles d'essai",
        featureCount: 4,
        visible: false,
        opacity: 0.6,
        position: 0,
      }),
    ]);
    const importedLayerId = importedMap.overlays[0]!.layerId;
    expect(importedLayerId).not.toBe(layerId);
    const importedLayer = resourceDetailSchema.parse(
      domainBody(await target.agent.get(`/api/resources/${importedLayerId}`)),
    );
    expect(importedLayer).toMatchObject({ path: "Imports/arverna-epona/Captage/Cartes", featureCount: 4 });
    const drawingNotes = await target.agent.get(`/api/resources/${importedMapId}/feature-notes`).expect(200);
    expect(drawingNotes.body.properties.items).toEqual([expect.objectContaining({ key: drawingId })]);
    const importedDrawingNote = await target.agent
      .get(`/api/resources/${drawingNotes.body.properties.items[0].noteId}`)
      .expect(200);
    expect(importedDrawingNote.body.properties.content).toBe("Chêne à conserver.");
    const features = await target.agent.get(`/api/resources/${importedLayerId}/features`).expect(200);
    expect(
      geographicLayerFeatureCollectionSchema.parse(JSON.parse(features.text)).features.map(({ sourceId }) => sourceId),
    ).toEqual(["essai-1", "essai-2", "essai-3", "essai-4"]);
  });

  // @verifies-requirement HALL-FR-DOC-360
  // @verifies-requirement HALL-FR-DOC-390
  // @verifies-requirement HALL-FR-DOC-400
  it("keys parcels, keeps their notes across vintages and flags the commune's parcels", async () => {
    const { agent: administration, url } = await createPostgresHttpTestServer({ devAutoLogin: false });
    await administration.post("/api/auth/bootstrap").send(administrator).expect(201);
    await administration.post("/api/auth/login").send(administrator).expect(200);
    await administration
      .post("/api/users")
      .send({ ...reader, displayName: "Lecture seule", roles: ["reader"] })
      .expect(201);
    const importLayer = async (name: string) =>
      administration
        .post("/api/resources/geographic-layers/import")
        .field("path", "Cartes")
        .field("name", name)
        .attach("file", cadastreFixture, "parcelles.geojson")
        .expect(201);
    const first = await importLayer("Parcelles 2026");
    expect(first.body.properties.featureKey).toEqual({ kind: "cadastreParcel", property: "id" });
    const features = geographicLayerFeatureCollectionSchema.parse(
      JSON.parse((await administration.get(`/api/resources/${first.body.properties.id}/features`).expect(200)).text),
    );
    expect(features.features.map(({ key, label }) => [key, label])).toEqual([
      ["999990000A0001", "A 1"],
      ["999990000A0002", "A 2"],
      ["999990000A0003", "A 3"],
    ]);

    const createNote = action(first.body, "resource.create-geographic-feature-note");
    const note = await administration.post(createNote.href).send({ position: 1 }).expect(201);
    expect(note.body.properties).toMatchObject({
      key: "999990000A0002",
      subjectKind: "cadastreParcel",
      name: "Parcelle A 2 (999990000A0002)",
      fullPath: "Cartes/Notes cartographiques/Parcelle A 2 (999990000A0002)",
    });
    const noteId = note.body.properties.noteId as string;
    await administration
      .put(`/api/resources/${noteId}/content`)
      .send({ kind: "text", expectedVersion: 1, content: "Bail agricole jusqu’en 2030." })
      .expect(200);
    const search = await administration.get("/api/resources/search?query=Parcelle%20A%202").expect(200);
    expect(search.body.properties.items.map(({ id }: { id: string }) => id)).toContain(noteId);

    const second = await importLayer("Parcelles 2027");
    const notesLink = (second.body.links as Array<{ rel: string[]; href: string }>).find((link) =>
      link.rel.includes("feature-notes"),
    );
    const notes = await administration.get(notesLink!.href).expect(200);
    expect(notes.body.properties.items).toEqual([expect.objectContaining({ key: "999990000A0002", noteId })]);

    const empty = await administration
      .post("/api/resources/geographic-layers/municipal-property/import")
      .field("label", "Liste vide")
      .field("list", "aucune parcelle")
      .expect(422);
    expect(empty.body).toMatchObject({ code: "municipal_property_empty", errors: ["aucune", "parcelle"] });
    const imported = await administration
      .post("/api/resources/geographic-layers/municipal-property/import")
      .field("label", "Liste du secrétariat")
      .attach("file", Buffer.from("idu;nature\n999990000A0001;mairie\n999990000A0009;bois\n"), "proprietes.csv")
      .expect(201);
    expect(imported.body.properties).toMatchObject({
      source: {
        label: "Liste du secrétariat",
        fileName: "proprietes.csv",
        parcelCount: 2,
        importedBy: "Administration",
      },
      parcelIds: ["999990000A0001", "999990000A0009"],
      matchedParcelCount: 1,
      rejected: ["idu", "nature", "mairie", "bois"],
    });

    const readerAgent = request.agent(url);
    await readerAgent.post("/api/auth/login").send(reader).expect(200);
    const property = await readerAgent.get("/api/resources/geographic-layers/municipal-property").expect(200);
    expect(property.body.properties.parcelIds).toEqual(["999990000A0001", "999990000A0009"]);
    expect(property.body.actions).toBeUndefined();
    await readerAgent.get(notesLink!.href).expect(200);
    await readerAgent.post(createNote.href).send({ position: 0 }).expect(403);
    await readerAgent
      .post("/api/resources/geographic-layers/municipal-property/import")
      .field("label", "Liste")
      .field("list", "999990000A0001")
      .expect(403);
  });

  // @verifies-requirement HALL-FR-DOC-230
  // @verifies-requirement HALL-FR-DOC-380
  it("serves properties in file order and lets a contributor upload images only into texts they may edit", async () => {
    const { agent: administration, url } = await createPostgresHttpTestServer({ devAutoLogin: false });
    await administration.post("/api/auth/bootstrap").send(administrator).expect(201);
    await administration.post("/api/auth/login").send(administrator).expect(200);
    await administration
      .post("/api/users")
      .send({ ...contributor, displayName: "Contribution", roles: ["contributor"] })
      .expect(201);
    const layer = await administration
      .post("/api/resources/geographic-layers/import")
      .field("path", "Cartes")
      .attach("file", cadastreFixture, "parcelles.geojson")
      .expect(201);
    expect(layer.body.properties.propertyKeys).toEqual(["id", "commune", "prefixe", "section", "numero", "contenance"]);
    const features = await administration.get(`/api/resources/${layer.body.properties.id}/features`).expect(200);
    expect(Object.keys(JSON.parse(features.text).features[0].properties)).toEqual([
      "id",
      "commune",
      "prefixe",
      "section",
      "numero",
      "contenance",
    ]);
    const ordinaryText = await administration
      .post("/api/resources")
      .send({ kind: "text", path: "", name: "Texte du secrétariat", content: "" })
      .expect(201);

    const contributorAgent = request.agent(url);
    await contributorAgent.post("/api/auth/login").send(contributor).expect(200);
    const collection = await contributorAgent.get("/api/resources").expect(200);
    expect((collection.body.actions as SirenAction[]).map(({ name }) => name)).toEqual([
      "resource.create-editor-asset",
    ]);
    const note = await contributorAgent
      .post(action(layer.body, "resource.create-geographic-feature-note").href)
      .send({ position: 0 })
      .expect(201);
    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6uAAAAABJRU5ErkJggg==",
      "base64",
    );
    await contributorAgent
      .post("/api/resources/editor-assets")
      .field("ownerKind", "textResourceContent")
      .field("ownerId", note.body.properties.noteId)
      .field("title", "Photo de la parcelle")
      .attach("file", image, "parcelle.png")
      .expect(201);
    await contributorAgent
      .post("/api/resources/editor-assets")
      .field("ownerKind", "textResourceContent")
      .field("ownerId", ordinaryText.body.properties.id)
      .field("title", "Photo")
      .attach("file", image, "photo.png")
      .expect(403);
  });

  // @verifies-requirement HALL-FR-DOC-390
  // @verifies-requirement HALL-FR-DOC-400
  it("carries parcel notes and the commune's parcels of the carried layers through a council business bundle", async () => {
    const source = await createPostgresHttpTestServer();
    const business = domainBody<{ id: string }>(
      await source.agent
        .post("/api/council-business")
        .send({ path: "Travaux", name: "Captage", reportName: "Rapport", reportContent: "État du captage" })
        .expect(201),
    );
    const map = await source.agent
      .post("/api/resources")
      .send({ kind: "geographic", path: "Travaux/Captage", name: "Périmètre", councilBusinessId: business.id })
      .expect(201);
    const layer = await source.agent
      .post("/api/resources/geographic-layers/import")
      .field("path", "Cartes")
      .field("name", "Parcelles")
      .field("geographicResourceId", map.body.properties.id)
      .attach("file", cadastreFixture, "parcelles.geojson")
      .expect(201);
    const note = await source.agent
      .post(action(layer.body, "resource.create-geographic-feature-note").href)
      .send({ position: 1 })
      .expect(201);
    await source.agent
      .put(`/api/resources/${note.body.properties.noteId}/content`)
      .send({ kind: "text", expectedVersion: 1, content: "Bail agricole jusqu’en 2030." })
      .expect(200);
    const listed = await source.agent
      .post("/api/resources/geographic-layers/municipal-property/import")
      .field("label", "Liste du secrétariat")
      .field("list", "999990000A0001 12345678900012 999990000B0007")
      .expect(201);
    expect(listed.body.properties.rejected).toEqual(["12345678900012"]);
    expect(listed.body.properties.matchedParcelCount).toBe(1);
    const exported = await source.agent
      .get(`/api/council-business/${business.id}/bundle?firstName=Epona&lastName=Arverna`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const bundle = decodeCouncilBusinessBundle(exported.body as Buffer);
    expect(bundle.manifest.geographicFeatureNotes).toEqual([
      {
        noteSourceId: note.body.properties.noteId,
        subjectKind: "cadastreParcel",
        layerSourceId: null,
        mapSourceId: null,
        key: "999990000A0002",
      },
    ]);
    expect(bundle.manifest.municipalProperty?.parcels.map(({ parcelId }) => parcelId)).toEqual(["999990000A0001"]);

    const target = await createPostgresHttpTestServer();
    await target.agent
      .post("/api/resources/geographic-layers/municipal-property/import")
      .field("label", "Liste locale")
      .field("list", "999990000A0003")
      .expect(201);
    await target.agent
      .post("/api/council-business/import-bundle")
      .attach("file", exported.body as Buffer, "captage.hallbundle")
      .expect(201);
    const layers = domainBody<Array<{ id: string; slug: string }>>(
      await target.agent.get("/api/resources/geographic-layers").expect(200),
    );
    expect(layers).toHaveLength(1);
    const notes = await target.agent.get(`/api/resources/${layers[0]!.slug}/feature-notes`).expect(200);
    expect(notes.body.properties.items).toEqual([expect.objectContaining({ key: "999990000A0002" })]);
    const importedNote = await target.agent.get(`/api/resources/${notes.body.properties.items[0].noteId}`).expect(200);
    expect(importedNote.body.properties.content).toBe("Bail agricole jusqu’en 2030.");
    const property = await target.agent.get("/api/resources/geographic-layers/municipal-property").expect(200);
    expect(property.body.properties.parcelIds).toEqual(["999990000A0001", "999990000A0003"]);
    const addedSource = property.body.properties.sources.find(
      ({ id }: { id: string }) => id === property.body.properties.parcelSourceIds["999990000A0001"],
    );
    expect(addedSource.label).toBe("Liste du secrétariat (dossier d’affaire importé)");
  });
});
