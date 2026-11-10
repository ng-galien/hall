/*
 * Hall screens visited by the screen audit. Each screen names the seed scenario it needs, the formats where it
 * exists, and `open`, which navigates to it from the identifiers read through the public API.
 */

async function items(page, path) {
  const response = await page.request.get(path);
  if (!response.ok()) throw new Error(`${path} answered ${response.status()}`);
  return ((await response.json()).entities ?? []).map((entity) => entity.properties);
}

async function first(page, path, predicate = () => true) {
  const found = (await items(page, path)).find(predicate);
  if (!found) throw new Error(`No item of ${path} matches this screen`);
  return found;
}

async function visible(page, testId) {
  await page.getByTestId(testId).first().waitFor({ state: "visible", timeout: 10_000 });
}

const route = (path) => async (page) => {
  await page.goto(`/app${path}`);
};

const detail = (listPath, routeOf, predicate) => async (page) => {
  const item = await first(page, listPath, predicate);
  await page.goto(`/app${routeOf(item)}`);
};

async function votedPoint(page) {
  const meetings = (await items(page, "/api/council-meetings")).filter((meeting) => meeting.closedAt);
  for (const meeting of meetings) {
    const [ballot] = await items(page, `/api/ballots?meetingId=${meeting.id}`);
    if (!ballot) continue;
    await page.goto(`/app/meetings/${meeting.id}/points/${ballot.agendaItemId}`);
    return;
  }
  throw new Error("No closed meeting has a point with a vote");
}

/** Waits until the lazy page and its data have replaced the loading placeholders; a screen still loading is measured anyway. */
export async function ready(page) {
  await page
    .waitForFunction(
      () => {
        const loading = [...document.querySelectorAll("body *")].some(
          (element) =>
            /^Chargement/.test((element.firstChild?.textContent ?? "").trim()) && element.getClientRects().length > 0,
        );
        if (loading) return false;
        const main = document.querySelector("[data-testid=application-main]");
        if (main && !(main.textContent ?? "").trim()) return false;
        return !document.querySelector("[data-testid=loading-indicator], [data-testid$=-loading], [aria-busy=true]");
      },
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
}

const phone = ["telephone"];
const longTitle =
  "Convention de mise à disposition des salles de la maison commune de l’oppidum aux associations de la commune";
const all = ["telephone", "tablette", "ordinateur"];

export const screens = [
  { id: "accueil", title: "Accueil", scenario: "minutes", open: route("/") },
  { id: "seances", title: "Séances", scenario: "minutes", open: route("/meetings") },
  {
    id: "seance-preparation",
    title: "Séance en préparation",
    scenario: "minutes",
    open: detail(
      "/api/council-meetings",
      (meeting) => `/meetings/${meeting.id}`,
      (meeting) => !meeting.startedAt && !meeting.closedAt,
    ),
  },
  {
    id: "seance-close",
    title: "Séance close",
    scenario: "minutes",
    open: detail(
      "/api/council-meetings",
      (meeting) => `/meetings/${meeting.id}`,
      (meeting) => meeting.closedAt,
    ),
  },
  { id: "point-vote", title: "Point de séance avec vote", scenario: "minutes", open: votedPoint },
  {
    id: "seance-en-cours",
    title: "Séance en cours",
    scenario: "default",
    open: detail(
      "/api/council-meetings",
      (meeting) => `/meetings/${meeting.id}`,
      (meeting) => meeting.startedAt && !meeting.closedAt,
    ),
  },
  {
    id: "mode-seance",
    title: "Mode séance",
    scenario: "default",
    open: detail(
      "/api/council-meetings",
      (meeting) => `/meetings/${meeting.id}/live`,
      (meeting) => meeting.startedAt && !meeting.closedAt,
    ),
  },
  { id: "proces-verbaux", title: "Procès-verbaux", scenario: "minutes", open: route("/minutes") },
  {
    id: "proces-verbal",
    title: "Procès-verbal",
    scenario: "minutes",
    open: detail("/api/minutes", (minutes) => `/minutes/${minutes.id}`),
  },
  { id: "deliberations", title: "Délibérations", scenario: "minutes", open: route("/council-decisions") },
  {
    id: "deliberation",
    title: "Délibération",
    scenario: "minutes",
    open: detail("/api/council-decisions", (decision) => `/council-decisions/${decision.id}`),
  },
  { id: "documents", title: "Documents", scenario: "minutes", open: route("/workspace") },
  { id: "dossier", title: "Dossier", scenario: "minutes", open: route("/workspace?path=Conseil") },
  {
    id: "document-texte",
    title: "Document texte",
    scenario: "minutes",
    open: detail(
      "/api/resources",
      (resource) => `/workspace?resource=${resource.id}`,
      (resource) => resource.kind === "text",
    ),
  },
  {
    id: "document-titre-long",
    title: "Document au titre long",
    scenario: "minutes",
    /** Creates a temporary document in the disposable database: the dataset has no title longer than a phone header. */
    async open(page) {
      const response = await page.request.post("/api/resources", {
        data: { kind: "text", path: "Conseil", name: longTitle, content: "Texte du document." },
      });
      if (!response.ok()) throw new Error(`/api/resources answered ${response.status()}`);
      const { id } = (await response.json()).properties;
      await page.goto(`/app/workspace?resource=${id}`);
    },
  },
  {
    id: "affaire",
    title: "Affaire",
    scenario: "minutes",
    open: detail("/api/council-business", (business) => `/workspace?councilBusiness=${business.id}`),
  },
  {
    id: "menu-nouveau",
    title: "Menu « Nouveau »",
    scenario: "minutes",
    async open(page) {
      await page.goto("/app/workspace");
      const trigger = page.locator('[data-testid="workspace-create-menu"]:visible').first();
      await trigger.waitFor({ state: "visible" });
      await trigger.click();
      await visible(page, "workspace-create-options");
    },
  },
  { id: "cartes", title: "Cartes", scenario: "minutes", open: route("/maps") },
  {
    id: "carte",
    title: "Carte",
    scenario: "minutes",
    open: detail(
      "/api/resources",
      (resource) => `/maps/${resource.id}`,
      (resource) => resource.kind === "geographic",
    ),
  },
  { id: "calendrier", title: "Calendrier", scenario: "minutes", open: route("/calendar") },
  { id: "contacts", title: "Contacts", scenario: "minutes", open: route("/contacts") },
  {
    id: "contact",
    title: "Contact",
    scenario: "minutes",
    open: detail("/api/contacts", (contact) => `/contacts/${contact.id}`),
  },
  { id: "membres", title: "Membres du conseil", scenario: "minutes", open: route("/council-members") },
  {
    id: "membre",
    title: "Membre du conseil",
    scenario: "minutes",
    open: detail("/api/council-members", (member) => `/council-members/${member.id}`),
  },
  { id: "commissions", title: "Commissions", scenario: "minutes", open: route("/council-committees") },
  {
    id: "commission",
    title: "Commission",
    scenario: "minutes",
    open: detail("/api/council-committees", (committee) => `/council-committees/${committee.id}`),
  },
  { id: "representations", title: "Représentations", scenario: "minutes", open: route("/council-delegations") },
  {
    id: "representation",
    title: "Représentation",
    scenario: "minutes",
    open: detail("/api/council-delegations", (delegation) => `/council-delegations/${delegation.id}`),
  },
  { id: "modeles", title: "Modèles", scenario: "minutes", open: route("/templates") },
  {
    id: "modele",
    title: "Modèle",
    scenario: "minutes",
    open: detail("/api/templates", (template) => `/templates/${template.id}`),
  },
  { id: "utilisateurs", title: "Utilisateurs", scenario: "minutes", open: route("/users") },
  {
    id: "utilisateur",
    title: "Utilisateur",
    scenario: "minutes",
    open: detail("/api/users", (user) => `/users/${user.id}`),
  },
  { id: "parametres", title: "Paramètres", scenario: "minutes", open: route("/settings") },
  { id: "aide", title: "Aide", scenario: "minutes", open: route("/docs") },
  {
    id: "menu-plus",
    title: "Feuille « Plus »",
    scenario: "minutes",
    formats: phone,
    async open(page) {
      await page.goto("/app/");
      await page.getByTestId("phone-navigation-more").click();
      await visible(page, "phone-more");
    },
  },
  {
    id: "menu-navigation",
    title: "Menu de navigation",
    scenario: "minutes",
    formats: ["tablette"],
    async open(page) {
      await page.goto("/app/");
      await page.getByTestId("navigation-toggle").click();
      await visible(page, "mobile-navigation");
    },
  },
].map((screen) => ({ formats: all, ...screen }));
