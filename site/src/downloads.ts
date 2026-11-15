/**
 * Fichiers de la dernière version publiée de Hall, lus à la construction du site dans la version publique de GitHub
 * (plugin hallRelease de vite.config.ts). Les noms des fichiers portent le numéro de version : chaque fichier est
 * reconnu par son préfixe de plateforme et son extension, et son adresse est celle de la version publiée.
 */

/** Un fichier téléchargeable de la version. */
export type DownloadKey = "windows" | "macos-arm64" | "macos-x64" | "linux-deb" | "linux-rpm" | "server";

export interface ReleaseFile {
  readonly key: DownloadKey;
  readonly name: string;
  readonly size: number;
  readonly url: string;
}

export interface Release {
  readonly version: string;
  readonly page: string;
  readonly files: readonly ReleaseFile[];
  readonly checksums: string | null;
}

export const repositoryUrl = "https://github.com/ng-galien/hall";
export const releasesUrl = `${repositoryUrl}/releases`;
export const serverGuideUrl = `${repositoryUrl}/blob/main/docs/distribution.md`;

/** Reconnaissance de chaque fichier d'après les noms produits par scripts/distribution/release-publication.mjs. */
const patterns: readonly [DownloadKey, RegExp][] = [
  ["windows", /^windows-x64-.*-Setup\.exe$/],
  ["macos-arm64", /^macos-arm64-.*\.dmg$/],
  ["macos-x64", /^macos-x64-.*\.dmg$/],
  ["linux-deb", /^linux-x64-.*\.deb$/],
  ["linux-rpm", /^linux-x64-.*\.rpm$/],
  ["server", /^ng-galien-hall-.*\.tgz$/],
];

interface GitHubAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

/** Fichiers attendus d'une version publiée de GitHub ; une erreur nomme ceux qui manquent. */
export function releaseFromGitHub(data: { tag_name: string; html_url: string; assets: GitHubAsset[] }): Release {
  const files: ReleaseFile[] = [];
  const missing: DownloadKey[] = [];
  for (const [key, pattern] of patterns) {
    const asset = data.assets.find((candidate) => pattern.test(candidate.name));
    if (asset) files.push({ key, name: asset.name, size: asset.size, url: asset.browser_download_url });
    else missing.push(key);
  }
  if (missing.length > 0) throw new Error(`Release ${data.tag_name} has no file for ${missing.join(", ")}`);
  const checksums = data.assets.find((asset) => asset.name === "SHA256SUMS.txt")?.browser_download_url ?? null;
  return { version: data.tag_name.replace(/^v/, ""), page: data.html_url, files, checksums };
}

/** Libellés de chaque fichier : système, précision, format. */
export const downloadLabels: Record<DownloadKey, { system: string; detail: string; format: string; short: string }> = {
  windows: { system: "Windows", detail: "Windows 10 et Windows 11", format: "Installateur .exe", short: "Windows" },
  "macos-arm64": {
    system: "Mac, puce Apple",
    detail: "« À propos de ce Mac » indique « Puce »",
    format: "Image disque .dmg",
    short: "Mac, puce Apple",
  },
  "macos-x64": {
    system: "Mac, processeur Intel",
    detail: "« À propos de ce Mac » indique « Processeur »",
    format: "Image disque .dmg",
    short: "Mac, Intel",
  },
  "linux-deb": { system: "Linux, paquet .deb", detail: "Ubuntu, Debian", format: "Paquet .deb", short: "Linux .deb" },
  "linux-rpm": { system: "Linux, paquet .rpm", detail: "Fedora, openSUSE", format: "Paquet .rpm", short: "Linux .rpm" },
  server: {
    system: "Serveur de la mairie",
    detail: "Paquet npm, PostgreSQL requis",
    format: "Archive .tgz",
    short: "Serveur",
  },
};

/** Poids en mégaoctets, à la française. */
export function megabytes(size: number): string {
  return `${Math.max(1, Math.round(size / 1_000_000)).toLocaleString("fr-FR")} Mo`;
}

/** Système de l'ordinateur du visiteur ; null sur un téléphone ou une tablette ; un Mac d'architecture inconnue reçoit le fichier de la puce Apple. */
export async function detectedDownload(): Promise<DownloadKey | null> {
  const agent = `${navigator.userAgent} ${navigator.platform}`;
  if (/iPhone|iPad|iPod|Android/i.test(agent) || (/Mac/i.test(agent) && navigator.maxTouchPoints > 1)) return null;
  if (/Mac/i.test(agent)) {
    const data = (
      navigator as Navigator & {
        userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }> };
      }
    ).userAgentData;
    try {
      const values = await data?.getHighEntropyValues?.(["architecture"]);
      if (values?.architecture === "x86") return "macos-x64";
    } catch {
      return "macos-arm64";
    }
    return "macos-arm64";
  }
  if (/Linux|X11/i.test(agent)) return "linux-deb";
  if (/Win/i.test(agent)) return "windows";
  return null;
}
