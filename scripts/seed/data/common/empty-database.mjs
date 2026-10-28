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
  inspectedCollections[3] = inspectedCollections[3].filter((user) => user.email !== signedInEmail);
  if (inspectedCollections.some((items) => items.length > 0)) {
    throw new Error("La base n'est pas vide : seed annulé. Utilisez une base dédiée vide.");
  }
}
