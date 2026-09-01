import type { LegalReferenceFund, LegalReferenceSearchResult } from "@hall/domain";
import type { ServerConfig } from "../../core/config.js";
import {
  type LegalReferenceProvider,
  type LegalReferenceProviderSnapshot,
  OfficialSourceError,
} from "../../services/legalReferenceProvider.js";

const endpoints = {
  sandbox: {
    api: "https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app",
    oauth: "https://sandbox-oauth.piste.gouv.fr/api/oauth/token",
  },
  production: {
    api: "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app",
    oauth: "https://oauth.piste.gouv.fr/api/oauth/token",
  },
} as const;

type FetchLike = typeof fetch;

type Token = { value: string; expiresAt: number };

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OfficialSourceError("invalidResponse");
  return value as Record<string, unknown>;
}

function timestampValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function boundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) throw new OfficialSourceError("responseTooLarge");
  if (!response.body) throw new OfficialSourceError("invalidResponse");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      throw new OfficialSourceError("responseTooLarge");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new OfficialSourceError("invalidResponse");
  }
}

async function request(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maximumBytes: number,
): Promise<unknown> {
  try {
    const response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 401 || response.status === 403) throw new OfficialSourceError("accessDenied");
    if (!response.ok) throw new OfficialSourceError("unavailable");
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") throw new OfficialSourceError("invalidResponse");
    return boundedJson(response, maximumBytes);
  } catch (error) {
    if (error instanceof OfficialSourceError) throw error;
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new OfficialSourceError("timeout");
    }
    throw new OfficialSourceError("unavailable");
  }
}

function unavailableProvider(): LegalReferenceProvider {
  const unavailable = async (): Promise<never> => {
    throw new OfficialSourceError("unavailable");
  };
  return { search: unavailable, fetchArticle: unavailable, refreshArticle: unavailable };
}

export function createLegifranceProvider({ config }: { config: ServerConfig }): LegalReferenceProvider {
  return buildLegifranceProvider(config, fetch);
}

export function buildLegifranceProvider(config: ServerConfig, fetchImpl: FetchLike): LegalReferenceProvider {
  const clientId = config.legifranceClientId;
  const clientSecret = config.legifranceClientSecret;
  if (!clientId || !clientSecret) return unavailableProvider();
  const endpoint = endpoints[config.legifranceEnvironment ?? "sandbox"];
  const timeoutMs = config.officialSourceTimeoutMs ?? 5_000;
  const maximumBytes = config.officialSourceMaximumBytes ?? 2 * 1024 * 1024;
  let token: Token | null = null;

  const accessToken = async (): Promise<string> => {
    if (token && token.expiresAt - 30_000 > Date.now()) return token.value;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "openid",
    });
    const payload = objectValue(
      await request(
        fetchImpl,
        endpoint.oauth,
        {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
          body,
        },
        timeoutMs,
        32 * 1024,
      ),
    );
    const value = textValue(payload.access_token);
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : Number(payload.expires_in);
    if (!value || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new OfficialSourceError("invalidResponse");
    token = { value, expiresAt: Date.now() + expiresIn * 1000 };
    return value;
  };

  const apiRequest = async (
    path: "/search" | "/consult/getArticle" | "/consult/getArticleByCid",
    body: unknown,
  ): Promise<unknown> =>
    request(
      fetchImpl,
      `${endpoint.api}${path}`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${await accessToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
      timeoutMs,
      maximumBytes,
    );

  const provider: LegalReferenceProvider = {
    async search({ query, effectiveAt }) {
      const fund: LegalReferenceFund = effectiveAt ? "CODE_DATE" : "CODE_ETAT";
      const normalizedArticleNumber = query
        .trim()
        .replace(/\s+/g, "")
        .replace(/^([A-Z])\./i, "$1");
      const isArticleNumber = /^[A-Z][0-9]+(?:-[0-9]+)+(?:[A-Z0-9-]*)?$/i.test(normalizedArticleNumber);
      const filters: Array<Record<string, unknown>> = [
        {
          facette: effectiveAt ? "NOM_CODE" : "TEXT_NOM_CODE",
          valeurs: ["Code général des collectivités territoriales"],
        },
      ];
      if (effectiveAt) filters.push({ facette: "DATE_VERSION", singleDate: effectiveAt });
      const payload = objectValue(
        await apiRequest("/search", {
          fond: fund,
          recherche: {
            champs: [
              {
                typeChamp: isArticleNumber ? "NUM_ARTICLE" : "ARTICLE",
                criteres: [
                  {
                    typeRecherche: isArticleNumber ? "EXACTE" : "UN_DES_MOTS",
                    valeur: isArticleNumber ? normalizedArticleNumber : query.trim(),
                    operateur: "ET",
                  },
                ],
                operateur: "ET",
              },
            ],
            filtres: filters,
            pageNumber: 1,
            pageSize: 8,
            operateur: "ET",
            sort: "PERTINENCE",
            typePagination: isArticleNumber ? "ARTICLE" : "DEFAUT",
          },
        }),
      );
      if (!Array.isArray(payload.results)) throw new OfficialSourceError("invalidResponse");
      const candidates = payload.results.flatMap((candidate) => {
        const result = objectValue(candidate);
        if (!Array.isArray(result.titles) || !Array.isArray(result.sections)) {
          throw new OfficialSourceError("invalidResponse");
        }
        const title = result.titles
          .map((candidateTitle) => objectValue(candidateTitle))
          .map((candidateTitle) => textValue(candidateTitle.title))
          .find((candidateTitle) => candidateTitle !== null);
        if (!title) throw new OfficialSourceError("invalidResponse");
        return result.sections.flatMap((candidateSection) => {
          const section = objectValue(candidateSection);
          if (!Array.isArray(section.extracts)) throw new OfficialSourceError("invalidResponse");
          return section.extracts.map((candidateExtract) => {
            const extract = objectValue(candidateExtract);
            const versionId = textValue(extract.id);
            const articleNumber = textValue(extract.num);
            const legalStatus = textValue(extract.legalStatus) ?? textValue(result.etat) ?? "unknown";
            if (!versionId?.startsWith("LEGIARTI") || !articleNumber) {
              throw new OfficialSourceError("invalidResponse");
            }
            return { versionId, articleNumber, legalStatus, title };
          });
        });
      });
      const uniqueCandidates = [
        ...new Map(
          candidates
            .filter(({ legalStatus }) => fund !== "CODE_ETAT" || legalStatus === "VIGUEUR")
            .map((candidate) => [candidate.versionId, candidate]),
        ).values(),
      ].slice(0, 8);
      return uniqueCandidates.map(
        (candidate): LegalReferenceSearchResult => ({
          provider: "legifrance",
          referenceKind: "article",
          fund,
          versionId: candidate.versionId,
          title: `${candidate.title}, article ${candidate.articleNumber}`,
          citationLabel: candidate.articleNumber,
          effectiveAt,
          legalStatus: candidate.legalStatus,
          sourceUrl: `https://www.legifrance.gouv.fr/codes/article_lc/${candidate.versionId}`,
        }),
      );
    },
    async fetchArticle({ fund, versionId, effectiveAt }) {
      const rawProviderPayload = await apiRequest("/consult/getArticle", { id: versionId });
      const payload = objectValue(rawProviderPayload);
      const article = objectValue(payload.article ?? payload);
      const returnedVersionId = textValue(article.id);
      const returnedCommonId = textValue(article.cid) ?? textValue(article.commonId);
      const normalizedContent = textValue(article.texte) ?? textValue(article.text);
      if (returnedVersionId !== versionId || !returnedCommonId || !normalizedContent) {
        throw new OfficialSourceError("invalidResponse");
      }
      return {
        commonId: returnedCommonId,
        versionId,
        effectiveAt: fund === "CODE_DATE" ? effectiveAt : null,
        fetchedAt: new Date().toISOString(),
        validFrom: textValue(article.dateDebut),
        validTo: textValue(article.dateFin),
        legalStatus: textValue(article.etat) ?? "unknown",
        sourceUrl: `https://www.legifrance.gouv.fr/codes/article_lc/${versionId}`,
        providerUpdatedAt: textValue(article.dateModif),
        citationLabel: textValue(article.num) ?? versionId,
        attribution:
          "Source : DILA - Légifrance. Données réutilisées sous Licence Ouverte 2.0. Vérifier la source officielle.",
        normalizedContent,
        rawProviderPayload,
      } satisfies LegalReferenceProviderSnapshot;
    },
    async refreshArticle({ fund, commonId, effectiveAt }) {
      if ((fund === "CODE_ETAT" && effectiveAt !== null) || (fund === "CODE_DATE" && effectiveAt === null)) {
        throw new OfficialSourceError("invalidResponse");
      }
      const payload = objectValue(await apiRequest("/consult/getArticleByCid", { cid: commonId }));
      if (!Array.isArray(payload.listArticle)) throw new OfficialSourceError("invalidResponse");
      const candidates = payload.listArticle.map((candidate) => {
        const article = objectValue(candidate);
        const versionId = textValue(article.id);
        const returnedCommonId = textValue(article.cid);
        if (!versionId?.startsWith("LEGIARTI") || returnedCommonId !== commonId) {
          throw new OfficialSourceError("invalidResponse");
        }
        return {
          versionId,
          legalStatus: textValue(article.etat),
          validFrom: timestampValue(article.dateDebut),
          validTo: timestampValue(article.dateFin),
        };
      });
      const effectiveTimestamp = effectiveAt === null ? null : Date.parse(`${effectiveAt}T00:00:00.000Z`);
      if (effectiveTimestamp !== null && !Number.isFinite(effectiveTimestamp)) {
        throw new OfficialSourceError("invalidResponse");
      }
      const match = candidates
        .filter((candidate) =>
          fund === "CODE_ETAT"
            ? candidate.legalStatus === "VIGUEUR"
            : candidate.validFrom !== null &&
              candidate.validFrom <= effectiveTimestamp! &&
              (candidate.validTo === null || effectiveTimestamp! < candidate.validTo),
        )
        .sort(
          (left, right) => (right.validFrom ?? Number.NEGATIVE_INFINITY) - (left.validFrom ?? Number.NEGATIVE_INFINITY),
        )[0];
      if (!match) throw new OfficialSourceError("invalidResponse");
      return provider.fetchArticle({ fund, versionId: match.versionId, effectiveAt });
    },
  };
  return provider;
}
