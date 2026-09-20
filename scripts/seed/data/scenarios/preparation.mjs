export async function seedPreparation({ post }) {
  console.log("- Séance provisionnée, en préparation et sans date");
  await post("/council-meetings", {});
}
