// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));

import { ResourceImageFigure, ResourceImagePresentationProvider } from "../src/components/editor/images.tsx";

// @verifies-requirement HALL-FR-LAY-010
test("an image of a text is downloaded when it comes near the screen and decoded without holding the page", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(
      h(
        ResourceImagePresentationProvider,
        {
          resolveContentHref: async (id) => `/api/resources/binary-references/${id}/content`,
          renderResourcePreview: () => null,
        },
        h(ResourceImageFigure, { id: "photo", alt: "Balance du tacot", align: "left", width: 100, testId: "image" }),
      ),
    );
  });
  const image = host.querySelector("img");
  assert.ok(image, "the image is rendered once its address is known");
  assert.equal(image.getAttribute("loading"), "lazy");
  assert.equal(image.getAttribute("decoding"), "async");
  await act(async () => root.unmount());
});
