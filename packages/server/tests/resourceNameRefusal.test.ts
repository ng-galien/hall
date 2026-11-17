import { relocateResourceSchema } from "@hall/api-contract";
import express from "express";
import request from "supertest";
import { expect, it } from "vitest";
import { errorHandler } from "../src/api/errorHandler.js";

function application() {
  const app = express();
  app.use(express.json());
  app.post("/api/resources/relocate", (req, res) => {
    res.json(relocateResourceSchema.parse(req.body));
  });
  app.use(errorHandler);
  return app;
}

// @verifies-requirement HALL-FR-DOC-590
it("answers a refused name with the code of its reason", async () => {
  const app = application();
  for (const [name, code] of [
    ["  ", "resource_name_required"],
    [".", "resource_name_reserved"],
    ["..", "resource_name_reserved"],
    ["a".repeat(201), "resource_name_too_long"],
  ]) {
    const response = await request(app).post("/api/resources/relocate").send({ path: "", name });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe(code);
  }
  const malformed = await request(app).post("/api/resources/relocate").send({ path: "/", name: "photo" });
  expect(malformed.body.code).toBe("invalid_request");
});

// @verifies-requirement HALL-FR-DOC-590
it("accepts a name typed with « / » and records it with « ∕ »", async () => {
  const response = await request(application())
    .post("/api/resources/relocate")
    .send({ path: "photos", name: "Rapoutier dessous 17/11/2026.jpg" });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ path: "photos", name: "Rapoutier dessous 17∕11∕2026.jpg" });
});
