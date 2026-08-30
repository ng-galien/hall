import { describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "../core/config.js";
import { buildLegifranceProvider } from "../infrastructure/legal/legifranceProvider.js";
import { OfficialSourceError } from "../services/legalReferenceProvider.js";

const config: ServerConfig = {
  host: "127.0.0.1",
  port: 0,
  database: { kind: "sqlite", path: ":memory:" },
  legifranceEnvironment: "sandbox",
  legifranceClientId: "test-client",
  legifranceClientSecret: "test-secret",
  officialSourceTimeoutMs: 20,
  officialSourceMaximumBytes: 1_024,
};

const jsonResponse = (value: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });

describe("Légifrance provider boundary", () => {
  it("uses only allowlisted PISTE hosts and caches the OAuth token", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    const provider = buildLegifranceProvider(config, fetchImpl);

    await provider.search({ query: "https://127.0.0.1/private", effectiveAt: null });
    await provider.search({ query: "L2121-10", effectiveAt: null });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      "https://sandbox-oauth.piste.gouv.fr/api/oauth/token",
      "https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app/search",
      "https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app/search",
    ]);
    expect(new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body)).get("scope")).toBe("openid");
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ accept: "application/json" });
    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({ accept: "application/json" });
    expect(String(fetchImpl.mock.calls[1]?.[1]?.body)).toContain("https://127.0.0.1/private");
  });

  it("sends the official search contract and parses nested title results", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              etat: "VIGUEUR",
              titles: [
                {
                  id: "LEGITEXT000006070633_01-09-2001",
                  cid: "LEGITEXT000006070633",
                  title: "Code général des collectivités territoriales",
                  legalStatus: "VIGUEUR",
                },
              ],
              sections: [
                {
                  id: "LEGISCTA000006180960",
                  extracts: [
                    {
                      id: "LEGIARTI000041410274",
                      num: "L2121-10",
                      legalStatus: "VIGUEUR",
                      dateDebut: "2019-12-29T00:00:00.000+0000",
                      dateFin: "2999-01-01T00:00:00.000+0000",
                    },
                  ],
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    const provider = buildLegifranceProvider(config, fetchImpl);

    const current = await provider.search({ query: "convocation", effectiveAt: null });
    await provider.search({ query: "convocation", effectiveAt: "2025-04-15" });

    expect(current).toEqual([
      expect.objectContaining({
        versionId: "LEGIARTI000041410274",
        citationLabel: "L2121-10",
        legalStatus: "VIGUEUR",
        title: "Code général des collectivités territoriales, article L2121-10",
      }),
    ]);
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({
      fond: "CODE_ETAT",
      recherche: {
        champs: [
          {
            typeChamp: "ARTICLE",
            criteres: [{ typeRecherche: "UN_DES_MOTS", valeur: "convocation", operateur: "ET" }],
            operateur: "ET",
          },
        ],
        filtres: [{ facette: "TEXT_NOM_CODE", valeurs: ["Code général des collectivités territoriales"] }],
        pageNumber: 1,
        pageSize: 8,
        operateur: "ET",
        sort: "PERTINENCE",
        typePagination: "DEFAUT",
      },
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toEqual({
      fond: "CODE_DATE",
      recherche: {
        champs: [
          {
            typeChamp: "ARTICLE",
            criteres: [{ typeRecherche: "UN_DES_MOTS", valeur: "convocation", operateur: "ET" }],
            operateur: "ET",
          },
        ],
        filtres: [
          { facette: "NOM_CODE", valeurs: ["Code général des collectivités territoriales"] },
          { facette: "DATE_VERSION", singleDate: "2025-04-15" },
        ],
        pageNumber: 1,
        pageSize: 8,
        operateur: "ET",
        sort: "PERTINENCE",
        typePagination: "DEFAUT",
      },
    });
  });

  it("uses the official exact article-number search for a CGCT article reference", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    const provider = buildLegifranceProvider(config, fetchImpl);

    await provider.search({ query: "L. 2121-10", effectiveAt: null });

    const body = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
    expect(body.recherche.champs).toEqual([
      {
        typeChamp: "NUM_ARTICLE",
        criteres: [{ typeRecherche: "EXACTE", valeur: "L2121-10", operateur: "ET" }],
        operateur: "ET",
      },
    ]);
    expect(body.recherche.typePagination).toBe("ARTICLE");
  });

  it("does not consult candidate articles while the user is searching", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              etat: "VIGUEUR",
              titles: [{ title: "Code général des collectivités territoriales" }],
              sections: [
                {
                  extracts: [
                    {
                      id: "LEGIARTI000006389875",
                      num: "L2121-17",
                      legalStatus: "VIGUEUR",
                    },
                  ],
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          article: {
            id: "LEGIARTI000006389875",
            cid: "LEGIARTI000006389875-CID",
            num: "L2121-17",
            etat: "VIGUEUR",
          },
        }),
      );
    const provider = buildLegifranceProvider(config, fetchImpl);

    await provider.search({ query: "L2121-17", effectiveAt: null });

    expect(fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/api/oauth/token",
      "/dila/legifrance/lf-engine-app/search",
    ]);
  });

  it("refreshes a current article from its stable CID", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          listArticle: [
            {
              id: "LEGIARTI000031038655",
              cid: "LEGIARTI000006389865",
              etat: "MODIFIE",
              dateDebut: 1439078400000,
              dateFin: 1577577600000,
            },
            {
              id: "LEGIARTI000041410274",
              cid: "LEGIARTI000006389865",
              etat: "VIGUEUR",
              dateDebut: 1577577600000,
              dateFin: 32472144000000,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          article: {
            id: "LEGIARTI000041410274",
            cid: "LEGIARTI000006389865",
            num: "L2121-10",
            etat: "VIGUEUR",
            texte: "Toute convocation est faite par le maire.",
          },
        }),
      );
    const provider = buildLegifranceProvider(config, fetchImpl);

    const snapshot = await provider.refreshArticle({
      fund: "CODE_ETAT",
      commonId: "LEGIARTI000006389865",
      effectiveAt: null,
    });

    expect(snapshot.versionId).toBe("LEGIARTI000041410274");
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      "https://sandbox-oauth.piste.gouv.fr/api/oauth/token",
      "https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/getArticleByCid",
      "https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/getArticle",
    ]);
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({ cid: "LEGIARTI000006389865" });
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toEqual({ id: "LEGIARTI000041410274" });
  });

  it("refreshes the article version covering the requested date", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          listArticle: [
            {
              id: "LEGIARTI000031038655",
              cid: "LEGIARTI000006389865",
              etat: "MODIFIE",
              dateDebut: 1439078400000,
              dateFin: 1577577600000,
            },
            {
              id: "LEGIARTI000041410274",
              cid: "LEGIARTI000006389865",
              etat: "VIGUEUR",
              dateDebut: 1577577600000,
              dateFin: 32472144000000,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          article: {
            id: "LEGIARTI000031038655",
            cid: "LEGIARTI000006389865",
            num: "L2121-10",
            etat: "MODIFIE",
            texte: "Version applicable en 2018.",
          },
        }),
      );
    const provider = buildLegifranceProvider(config, fetchImpl);

    const snapshot = await provider.refreshArticle({
      fund: "CODE_DATE",
      commonId: "LEGIARTI000006389865",
      effectiveAt: "2018-06-15",
    });

    expect(snapshot).toMatchObject({
      versionId: "LEGIARTI000031038655",
      effectiveAt: "2018-06-15",
      normalizedContent: "Version applicable en 2018.",
    });
  });

  it.each([
    ["an oversized declared response", jsonResponse({}, { "content-length": "2048" }), "responseTooLarge"],
    [
      "a non-JSON MIME type",
      new Response("{}", { status: 200, headers: { "content-type": "text/html" } }),
      "invalidResponse",
    ],
    [
      "an invalid JSON signature",
      new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
      "invalidResponse",
    ],
  ])("rejects %s", async (_label, providerResponse, reason) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(providerResponse);
    const provider = buildLegifranceProvider(config, fetchImpl);

    await expect(provider.search({ query: "L2121-10", effectiveAt: null })).rejects.toMatchObject({ reason });
  });

  it("turns a bounded request timeout into a credential-free provider error", async () => {
    const timeout = new Error("request timed out");
    timeout.name = "TimeoutError";
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    const provider = buildLegifranceProvider(config, fetchImpl);

    await expect(provider.search({ query: "L2121-10", effectiveAt: null })).rejects.toEqual(
      new OfficialSourceError("timeout"),
    );
  });

  it("refuses provider redirects even from an allowlisted initial host", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockRejectedValueOnce(new TypeError("redirect mode is error"));
    const provider = buildLegifranceProvider(config, fetchImpl);

    await expect(provider.search({ query: "L2121-10", effectiveAt: null })).rejects.toEqual(
      new OfficialSourceError("unavailable"),
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe("error");
    expect(fetchImpl.mock.calls[1]?.[1]?.redirect).toBe("error");
  });

  it("classifies a PISTE 403 without exposing its response body", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(
        new Response('{"client_id":"must-not-leak","query":"L2121-10"}', {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      );
    const provider = buildLegifranceProvider(config, fetchImpl);

    await expect(provider.search({ query: "L2121-10", effectiveAt: null })).rejects.toEqual(
      new OfficialSourceError("accessDenied"),
    );
  });

  it("stops reading a chunked response as soon as the byte limit is exceeded", async () => {
    const chunk = new Uint8Array(700).fill(32);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(body, { status: 200, headers: { "content-type": "application/json" } }));
    const provider = buildLegifranceProvider(config, fetchImpl);

    await expect(provider.search({ query: "L2121-10", effectiveAt: null })).rejects.toEqual(
      new OfficialSourceError("responseTooLarge"),
    );
  });
});
