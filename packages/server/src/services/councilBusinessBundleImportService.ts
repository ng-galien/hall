import { CouncilClientError, type CouncilClient } from "../clients/councilClient.js";
import { slugify } from "../repositories/publicIdentifiers.js";
import { decodeCouncilBusinessBundle, InvalidCouncilBusinessBundle } from "./councilBusinessBundleArchive.js";
import { DomainError } from "./errors.js";

export function createCouncilBusinessBundleImportService({ councilClient }: { councilClient: CouncilClient }) {
  return {
    async import(content: Buffer) {
      try {
        const { manifest, files } = decodeCouncilBusinessBundle(content);
        const slug = slugify(`${manifest.sender.lastName} ${manifest.sender.firstName}`);
        if (slug !== manifest.sender.slug) throw new InvalidCouncilBusinessBundle("Sender slug mismatch");
        if (await councilClient.openBusiness(manifest.business.sourceId)) throw new DomainError("conflict", 409);
        return await councilClient.importBusinessBundle({ manifest,
          files: Object.fromEntries([...files].map(([path, bytes]) => [path, bytes.toString("base64")])),
          path: `Imports/${slug}`,
        });
      } catch (error) {
        if (error instanceof InvalidCouncilBusinessBundle) throw new DomainError("invalid_request", 400);
        if (error instanceof CouncilClientError) throw new DomainError("conflict", 409);
        throw error;
      }
    },
  };
}
