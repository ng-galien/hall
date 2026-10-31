/** External representation of the council with the four chiefs of the relief army. */
export async function seedDelegations({ post }, { daysFromNow, memberContactIds }) {
  console.log("- Représentations extérieures");
  const delegation = await post("/council-delegations", {
    name: "Armée de secours des cités de Gaule",
    description:
      "Commandement de l’armée levée par l’assemblée des cités pour dégager l’oppidum. Les quatre représentants rendent compte au conseil par les messagers de la motion de liaison.",
  });
  const chiefs = ["Commius", "Viridomaros", "Éporédorix", "Vercassivellaunos"];
  for (const firstName of chiefs) {
    await post(`/council-delegations/${delegation.id}/memberships`, {
      contactId: memberContactIds[firstName],
      role: "primary",
      startedOn: daysFromNow(-20).slice(0, 10),
    });
  }
  console.log(`  une représentation extérieure, ${chiefs.length} représentants`);
}
