import { generatedDocumentTemplates } from "@hall/domain";

export async function assertEmptyDatabase({ get, signedInEmail }) {
  const inspectedCollections = await Promise.all([
    get("/contacts"),
    get("/council-members"),
    get("/council-committees"),
    get("/users"),
    get("/resources"),
    get("/council-business"),
    get("/council-decisions"),
    get("/council-meetings"),
    get("/templates"),
  ]);
  inspectedCollections[8] = inspectedCollections[8].filter(
    (entry) =>
      !generatedDocumentTemplates.some((standard) =>
        Object.entries(standard).every(([key, value]) => entry[key] === value),
      ),
  );
  inspectedCollections[3] = inspectedCollections[3].filter((user) => user.email !== signedInEmail);
  if (inspectedCollections.some((items) => items.length > 0)) {
    throw new Error("La base n'est pas vide : seed annulé. Utilisez une base dédiée vide.");
  }
}
