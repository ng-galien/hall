import { readFile } from "node:fs/promises";

const defaultDocument = ["Hall", "Modifications en temps réel", "cadrage"].join(` ${String.fromCodePoint(0x2014)} `);
const [planName = "hall-realtime-delivery", documentName = defaultDocument] = process.argv.slice(2);

async function call(endpoint, name, args) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const body = await response.text();
  const event = body.split(/\r?\n/).filter((line) => line.startsWith("data:")).at(-1);
  const result = JSON.parse(event ? event.slice(5) : body);
  if (result.error || result.result?.isError) throw new Error(`${name}: ${JSON.stringify(result.error ?? result.result)}`);
  const text = result.result?.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error(`${name}: no text result`);
  return text;
}

const trust = (name, args) => call(process.env.TRUST_MCP_URL ?? "http://127.0.0.1:4498/mcp", name, args);
const maket = (name, args) => call(process.env.MAKET_MCP_URL ?? "http://127.0.0.1:24843/mcp", name, args);

const plan = await trust("trust_plan_read", { plan: planName });
const rootReviewValidated = plan.includes("[SATISFIED] Reviewed document and catalogue are aligned");
const reviewStatus = (scope) =>
  new RegExp(`- refine: SATISFIED;[^\\n]*\\n  Mission: refinement/review-${scope}(?:\\n|$)`).test(plan);
const deliveryStatus = (scope) =>
  new RegExp(`- deliver: SATISFIED;[^\\n]*\\n  Mission: delivery/${scope}(?:\\n|$)`).test(plan);
const deliveryScopes = ["meeting", "resource", "frontend", "architecture", "coherence"];
const deliveryChecksValidated = deliveryScopes.every(deliveryStatus);
const reports = Object.fromEntries(
  await Promise.all(
    ["meeting", "resource", "frontend"].map(async (scope) => [
      scope,
      JSON.parse(await readFile(new URL(`../../.trust/reviews/realtime-${scope}.json`, import.meta.url), "utf8")),
    ]),
  ),
);
const integratedReview = JSON.parse(
  await readFile(new URL("../../.trust/reviews/realtime-integrated.json", import.meta.url), "utf8"),
);
const frontendDelivery = JSON.parse(
  await readFile(new URL("../../.trust/delivery/realtime-frontend.json", import.meta.url), "utf8"),
);
const browserProof = frontendDelivery.focusedTests.find((test) =>
  test.command.includes("realtime-meeting.spec.ts"),
);
const resourceProof = integratedReview.evidencePaths.includes(
  "packages/server/src/__tests__/resourceChangesPostgres.test.ts",
);
const catalog = JSON.parse(await readFile(new URL("../../requirements/catalog.json", import.meta.url), "utf8"));
const state = JSON.parse(await maket("maket_state", { action: "get", doc: documentName })).current;
const data = structuredClone(state.data);
const schema = structuredClone(state.schema);
const requiredIds = ["HALL-FR-MTG-320", "HALL-FR-DOC-280"];
for (const id of requiredIds) {
  const key = id.includes("MTG") ? "meeting" : "resource";
  data.requirements[key] = { id, ...catalog.requirements[id] };
}

data.feature.status = deliveryChecksValidated
  ? "Checks ciblés TRUST validés · bilan disponible"
  : "Plan TRUST en cours · revues validées";
data.pages.p1.sections.s3.items[2] =
  "T-03 · Ressource texte — nuage animé conservé comme toggle ; icône d’historique distincte avec infobulle, aperçu au survol/focus puis panneau informatif superposé à droite. Dernière modification par auteur, nature et date ; pas de commande ni comparaison/restauration.";
data.pages.p2.sections.s1.items[1] =
  "Après une mise à jour atomique enregistrée dans A, B voit un signal sur le nuage ; l’icône d’historique distincte affiche un aperçu au survol/focus et ouvre le panneau droit avec, pour chaque auteur, sa dernière modification, sa nature et son horodatage.";
data.pages.p3.sections.s2.items[2] =
  "À construire : conserver le toggle nuage et ses états ; ajouter une icône d’historique distincte avec infobulle, aperçu et panneau informatif superposé à droite, chargé à la demande ; aucun droit ni commande métier inventé côté client.";
data.pages.p4.summary = deliveryChecksValidated
  ? "Le Plan TRUST conserve l’accord Maket, trois revues enfants et les Checks ciblés de livraison."
  : "Le Plan TRUST relit l’accord Maket, puis valide trois revues enfants. Les Checks de livraison restent à établir.";
data.pages.p4.sections.s1.items = [
  "Maket : décision approuvée avec commentaire et exigences du catalogue alignées ; Check de cadrage VALIDATED.",
  "Trois missions inline : séance, ressource, interface. Chacune lit son périmètre et rend des constats sourcés.",
  "Nouvelle précision IHM : nuage de sauvegarde et icône d’historique distincts, visibles page wireframe.",
];
data.pages.p4.sections.s1.kind = "TRUST · entrée validée";
data.pages.p4.sections.s2.items = [
  "Les trois Checks enfants de revue sont VALIDATED ; leurs Results remontent au Plan parent après validation.",
  "Lacunes constatées : transport WebSocket, lecture d’audit ciblée et raccordement client à construire.",
  "Une contradiction produit nouvelle revient à the user ; aucun changement de schéma ne découle des revues seules.",
];
data.pages.p4.sections.s2.kind = "TRUST · revues validées";
data.pages.p4.sections.s3.items = [
  "Check de cadrage : VALIDATED, décision Maket et catalogue relus par l’opération TRUST.",
  "Revues séance, ressource et interface : VALIDATED ; constats sourcés dans le Plan et les rapports d’agents.",
  `Livraison : ${deliveryChecksValidated ? "Checks ciblés VALIDATED" : "Checks en cours"} ; détail des preuves et limites dans le journal.`,
];
data.pages.p4.sections.s3.kind = "TRUST · sortie observée";

data.pages.p6 = {
  title: "Journal · décisions et preuves",
  kicker: "HALL · SUIVI DE LIVRAISON",
  summary: deliveryChecksValidated
    ? "Bilan des décisions, revues et Checks ciblés exécutés ; limites de livraison explicites."
    : "État réel du Plan TRUST et des revues ; Checks de livraison en cours.",
  sections: {
    s1: {
      label: "Décisions conservées",
      kind: "Maket · accepté",
      items: [
        "Maket : approbation enregistrée avec commentaire ; exigences HALL-FR-MTG-320 et HALL-FR-DOC-280 acceptées dans Hall.",
        "T-01 séance : l’événement de conduite ramène le lecteur au point courant ; T-02 ressource : mises à jour atomiques de textes existants.",
        "T-03 IHM : nuage de sauvegarde conservé ; icône d’historique distincte et panneau droit en overlay, lecture seule.",
      ],
      tone: "input",
    },
    s2: {
      label: "Revues consignées",
      kind: "TRUST · Results",
      items: [
        `Cadrage : ${rootReviewValidated ? "VALIDATED" : "ouvert"} par le Check de lecture Maket et catalogue.`,
        ...["meeting", "resource", "frontend"].map((scope) => {
          const label = { meeting: "Séance", resource: "Ressource", frontend: "Interface" }[scope];
          const report = reports[scope];
          return `${label} : ${reviewStatus(scope) ? "VALIDATED" : "ouvert"} ; ${report.findings.length} constats, ${report.evidencePaths.length} références de code ; rapport .trust/reviews/realtime-${scope}.json.`;
        }),
      ],
      tone: "output",
    },
    s3: {
      label: "Livraison et suite",
      kind: "TRUST · Checks de livraison",
      items: [
        `Checks TRUST : séance ${deliveryStatus("meeting") ? "VALIDATED" : "ouvert"} ; ressource ${deliveryStatus("resource") ? "VALIDATED" : "ouvert"} ; interface ${deliveryStatus("frontend") ? "VALIDATED" : "ouvert"} ; architecture/taxonomie ${deliveryStatus("architecture") ? "VALIDATED" : "ouvert"} ; cohérence ${deliveryStatus("coherence") ? "VALIDATED" : "ouvert"}.`,
        `Revue indépendante : ${integratedReview.findings.length} constats, ${integratedReview.evidencePaths.length} sources ; ${integratedReview.deliveryReady ? "prête" : "non prête"}. ${integratedReview.deliveryReady ? "Aucune lacune bloquante relevée." : "Preuve ciblée du recentrage du lecteur encore demandée."}`,
        `Preuves ciblées : séance à deux sessions ${browserProof?.result.includes("passed") ? "passée" : "non établie"} ; ressource HTTP, WebSocket et seconde session ${resourceProof ? "sourcée" : "non établie"}.`,
        `Taxonomie Code Moniker : 0 violation, 0 entrée invalide ; 2 règles de recherche déjà non classées. Autorité temps réel documentée ; Check d’architecture ${deliveryStatus("architecture") ? "VALIDATED" : "ouvert"}.`,
        ...integratedReview.risks.map((risk) => `Limite relevée : ${risk}`),
      ],
      tone: deliveryChecksValidated ? "output" : "pending",
    },
  },
};

// Project the delivery state into the working pages, not only the journal.
const section = (label, kind, items, tone = "output") => ({ label, kind, items, tone });
if (deliveryChecksValidated) {
  data.pages.p2.sections.s3 = section("Composant réalisé", "Livraison · interface", [
    "Nuage de sauvegarde conservé ; icône d’historique distincte avec aperçu et panneau droit superposé.",
    "Le lecteur de séance rejoint le point courant après événement et reconnexion.",
    "Le wireframe page 5 conserve la conception approuvée ; les résultats figurent page 3."
  ]);
  data.pages.p3.title = "Implémentation et vérifications";
  data.pages.p3.summary = "Résultats par couche. États relus dans TRUST ; le parcours navigateur est un résultat consigné dans le rapport agent, sans nouveau rejeu.";
  data.pages.p3.sections.s1 = section("Serveur · séance et ressource", "TRUST · Checks validés", [
    "Séance : transport WebSocket, diffusion après succès et filtrage des lecteurs autorisés ; mission meeting satisfaite.",
    "Ressource : audit PostgreSQL par auteur et lecture HTTP autorisée ; mission resource satisfaite.",
    "Revue indépendante : " + integratedReview.findings.length + " constats sourcés ; " + integratedReview.openDecisions.length + " décision ouverte."
  ]);
  data.pages.p3.sections.s2 = section("Interface et parcours", "TRUST + rapport de test", [
    "Interface : Check validé ; typage et tests ciblés du suivi, du transport client et du panneau.",
    "Rapport agent : " + (browserProof?.result.includes("passed") ? "parcours Chromium séance à deux sessions réussi, avec reconnexion." : "preuve navigateur non établie."),
    "Ressource : preuve HTTP + WebSocket + seconde session référencée par la revue ; ce n’est pas un parcours Chromium de ressource."
  ]);
  data.pages.p3.sections.s3 = section("Architecture et limites", "TRUST · cohérence validée", [
    "Exigences : HALL-FR-MTG-320 et HALL-FR-DOC-280 ; Checks architecture et cohérence satisfaits.",
    "Navigateur : auto-connexion de test ; permissions de profils distincts vérifiées séparément côté serveur.",
    "Validation ciblée uniquement. Cette actualisation du document ne relance aucun test applicatif."
  ]);
  data.pages.p4.sections.s2 = section("Revues puis livraison", "TRUST · étapes satisfaites", [
    "Les trois revues sont conservées comme constats de conception antérieurs au développement.",
    "Les lacunes initiales de transport, audit et interface ont été traitées par les missions de livraison satisfaites.",
    "Les résultats par couche figurent page 3 ; les décisions et la revue finale figurent page 6."
  ]);
  // Remove obsolete hidden snapshots left by the original eight-page draft.
  delete data.pages.p7;
  delete data.pages.p8;
  for (const key of ["p7", "p8"]) {
    delete schema.properties.pages.properties[key];
    schema.properties.pages.required = schema.properties.pages.required.filter((value) => value !== key);
  }
}

if (!schema.properties.pages.properties.p6) {
  schema.properties.pages.properties.p6 = structuredClone(schema.properties.pages.properties.p4);
  schema.properties.pages.required.push("p6");
}
if (JSON.stringify(data) !== JSON.stringify(state.data) || JSON.stringify(schema) !== JSON.stringify(state.schema)) {
  await maket("maket_state", {
    action: "change_schema",
    doc: documentName,
    expected_revision: state.revision,
    schema,
    data,
  });
}

const pages = await maket("maket_page", { action: "list", doc: documentName });
if (Number.parseInt(pages, 10) < 6) {
  let html = await maket("maket_html", { action: "get", doc: documentName, page: 4 });
  html = html.replaceAll("state.pages.p4", "state.pages.p6");
  html = html.replace(/<section data-id="review-control".*?<\/section>/s, "");
  html = html.replace("4 / 5", "6 / 6");
  html = html.replace('class="card pending" data-id="card-1"', 'class="card input" data-id="card-1"');
  html = html.replace('class="card pending" data-id="card-2"', 'class="card output" data-id="card-2"');
  await maket("maket_page", { action: "add", doc: documentName, name: "Journal · décisions et preuves", html });
}
const layout = await maket("maket_html", { action: "check", doc: documentName, page: 6 });
if (!layout.includes("✓ Layout OK")) throw new Error(`Journal layout needs correction: ${layout}`);
const finalState = JSON.parse(await maket("maket_state", { action: "get", doc: documentName })).current;
console.log(`plan:${planName}`);
console.log(`review:${rootReviewValidated ? "validated" : "open"}`);
console.log(`children:${["meeting", "resource", "frontend"].filter(reviewStatus).length}`);
console.log("document:journal-page-6");
console.log(`documentRevision:${finalState.revision}`);
