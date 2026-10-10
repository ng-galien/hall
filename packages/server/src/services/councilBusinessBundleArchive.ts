import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { type CouncilBusinessBundleManifest, councilBusinessBundleManifestSchema } from "@hall/api-contract";

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;
const MAX_BINARY_BYTES = 64 * 1024 * 1024;

export interface CouncilBusinessBundleArchive {
  manifest: CouncilBusinessBundleManifest;
  files: ReadonlyMap<string, Buffer>;
}

export class InvalidCouncilBusinessBundle extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCouncilBusinessBundle";
  }
}

export function bundleContentHash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function validateArchive(input: CouncilBusinessBundleArchive): CouncilBusinessBundleArchive {
  const parsed = councilBusinessBundleManifestSchema.safeParse(input.manifest);
  if (!parsed.success) throw new InvalidCouncilBusinessBundle("Invalid manifest");
  const manifest = parsed.data;
  const identities = new Set(manifest.resources.map(({ data }) => data.id));
  if (identities.size !== manifest.resources.length) throw new InvalidCouncilBusinessBundle("Duplicate resource");
  const report = manifest.resources.find(({ data }) => data.id === manifest.business.reportSourceId);
  if (report?.data.kind !== "text") throw new InvalidCouncilBusinessBundle("Missing report");
  const folder = manifest.resources.find(({ data }) => data.id === manifest.business.folderSourceId);
  if (folder?.data.kind !== "folder" || report.data.path !== folder.data.fullPath) {
    throw new InvalidCouncilBusinessBundle("Invalid business folder");
  }
  for (const { data } of manifest.resources) {
    const fullPath = data.path ? `${data.path}/${data.name}` : data.name;
    if (data.fullPath !== fullPath) throw new InvalidCouncilBusinessBundle("Invalid resource path");
  }
  const associations = manifest.business.resourceSourceIds;
  if (new Set(associations).size !== associations.length || associations.some((id) => !identities.has(id))) {
    throw new InvalidCouncilBusinessBundle("Invalid associations");
  }
  const fileMetadata = new Map(manifest.files.map((file) => [file.path, file]));
  const paths = new Set(fileMetadata.keys());
  if (paths.size !== manifest.files.length || paths.size !== input.files.size) {
    throw new InvalidCouncilBusinessBundle("Duplicate or unexpected file");
  }
  let totalBytes = 0;
  for (const file of manifest.files) {
    const bytes = input.files.get(file.path);
    if (
      !bytes ||
      bytes.length !== file.byteSize ||
      bundleContentHash(bytes) !== file.sha256 ||
      file.path !== `blobs/${file.sha256}`
    ) {
      throw new InvalidCouncilBusinessBundle("File integrity mismatch");
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_BINARY_BYTES) throw new InvalidCouncilBusinessBundle("Bundle is too large");
  }
  for (const resource of manifest.resources) {
    if (resource.binaryPath && !paths.has(resource.binaryPath)) {
      throw new InvalidCouncilBusinessBundle("Missing binary");
    }
    if (resource.data.kind === "document" && !resource.binaryPath) {
      throw new InvalidCouncilBusinessBundle("Document has no original");
    }
    if (
      resource.data.kind === "geographicLayer" &&
      (!resource.binaryPath || fileMetadata.get(resource.binaryPath)?.mediaType !== "application/json")
    ) {
      throw new InvalidCouncilBusinessBundle("Geographic layer has no features");
    }
    if (
      resource.data.kind === "geographic" &&
      resource.data.overlays.some(
        (overlay) =>
          !manifest.resources.some(({ data }) => data.id === overlay.layerId && data.kind === "geographicLayer"),
      )
    ) {
      throw new InvalidCouncilBusinessBundle("Map links a layer that the bundle does not carry");
    }
    if (
      resource.data.kind === "document" &&
      (resource.binaryPath !== `blobs/${resource.data.binary.contentSha256}` ||
        fileMetadata.get(resource.binaryPath)?.byteSize !== resource.data.binary.byteSize)
    ) {
      throw new InvalidCouncilBusinessBundle("Document metadata mismatch");
    }
  }
  const assetIds = new Set<string>();
  for (const asset of manifest.editorAssets) {
    if (
      assetIds.has(asset.data.id) ||
      identities.has(asset.data.id) ||
      !paths.has(asset.binaryPath) ||
      asset.binaryPath !== `blobs/${asset.data.contentSha256}` ||
      fileMetadata.get(asset.binaryPath)?.byteSize !== asset.data.byteSize ||
      !manifest.resources.some(({ data }) => data.id === asset.data.owner.id && data.kind === "text")
    ) {
      throw new InvalidCouncilBusinessBundle("Invalid embedded asset");
    }
    assetIds.add(asset.data.id);
  }
  return { manifest, files: input.files };
}

/** Content-addressed entries are never interpreted as filesystem destinations. */
export function encodeCouncilBusinessBundle(input: CouncilBusinessBundleArchive): Buffer {
  const { manifest, files } = validateArchive(input);
  const expanded = Buffer.from(
    JSON.stringify({
      manifest,
      manifestSha256: bundleContentHash(Buffer.from(JSON.stringify(manifest))),
      files: [...files].map(([path, content]) => ({ path, base64: content.toString("base64") })),
    }),
  );
  if (expanded.length > MAX_EXPANDED_BYTES) throw new InvalidCouncilBusinessBundle("Bundle is too large");
  const archive = gzipSync(expanded);
  if (archive.length > MAX_ARCHIVE_BYTES) throw new InvalidCouncilBusinessBundle("Bundle is too large");
  return archive;
}

export function decodeCouncilBusinessBundle(archive: Buffer): CouncilBusinessBundleArchive {
  if (archive.length > MAX_ARCHIVE_BYTES) throw new InvalidCouncilBusinessBundle("Bundle is too large");
  try {
    const envelope: unknown = JSON.parse(gunzipSync(archive, { maxOutputLength: MAX_EXPANDED_BYTES }).toString("utf8"));
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("Invalid envelope");
    const fields = Object.keys(envelope);
    if (fields.length !== 3 || !fields.every((key) => ["manifest", "manifestSha256", "files"].includes(key))) {
      throw new Error("Invalid envelope fields");
    }
    const { manifest, manifestSha256, files } = envelope as {
      manifest: unknown;
      manifestSha256: unknown;
      files: unknown;
    };
    if (
      typeof manifestSha256 !== "string" ||
      bundleContentHash(Buffer.from(JSON.stringify(manifest))) !== manifestSha256 ||
      !Array.isArray(files)
    ) {
      throw new Error("Invalid envelope integrity");
    }
    if (files.length > 4000) throw new Error("Too many files");
    const decoded = new Map<string, Buffer>();
    for (const entry of files) {
      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        Object.keys(entry).length !== 2 ||
        typeof entry.path !== "string" ||
        typeof entry.base64 !== "string" ||
        !/^blobs\/[a-f0-9]{64}$/.test(entry.path) ||
        decoded.has(entry.path)
      )
        throw new Error("Invalid file entry");
      const bytes = Buffer.from(entry.base64, "base64");
      if (bytes.toString("base64") !== entry.base64) throw new Error("Invalid binary encoding");
      decoded.set(entry.path, bytes);
    }
    const parsed = councilBusinessBundleManifestSchema.parse(manifest);
    return validateArchive({ manifest: parsed, files: decoded });
  } catch (error) {
    if (error instanceof InvalidCouncilBusinessBundle) throw error;
    throw new InvalidCouncilBusinessBundle("Invalid or oversized archive");
  }
}
