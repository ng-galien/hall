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

/** The meeting in preparation of the seed, prepared and convened through the API, as the officer screens do it. */
async function convenedMeeting(page) {
  const meeting = await first(page, "/api/council-meetings", (entry) => !entry.closedAt);
  if (meeting.startedAt) return meeting;
  const [chair, secretary] = (await items(page, "/api/council-members")).filter((member) => member.active);
  const prepare = await page.request.put(`/api/council-meetings/${meeting.id}/prepare`, {
    data: {
      scheduledAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      location: "Maison commune de l’oppidum",
      chairMemberId: chair.id,
      secretaryMemberId: secretary.id,
    },
  });
  if (!prepare.ok() && prepare.status() !== 409) throw new Error(`prepare answered ${prepare.status()}`);
  const notices = await page.request.post(`/api/council-meetings/${meeting.id}/notices`, { data: {} });
  if (!notices.ok() && notices.status() !== 409) throw new Error(`notices answered ${notices.status()}`);
  return meeting;
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
  {
    id: "seance-close-point-deplie",
    title: "Séance close, un point déplié",
    scenario: "minutes",
    /** The closed meeting with its first folded content unfolded by its square « + ». */
    async open(page) {
      const meeting = await first(page, "/api/council-meetings", (entry) => entry.closedAt);
      await page.goto(`/app/meetings/${meeting.id}`);
      await ready(page);
      const fold = page
        .locator("main summary:has(.disclosure-badge), main [aria-expanded=false]:has(.disclosure-badge)")
        .first();
      if (!(await fold.isVisible().catch(() => false)))
        throw new Error("La séance close ne montre aucun contenu qui se déplie");
      await fold.click();
    },
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
  {
    id: "mode-seance-deports",
    title: "Mode séance, déports sur ce point",
    scenario: "default",
    /** The window « Conflit d'intérêts » of the current point, opened from « Déports sur ce point » in the live meeting. */
    async open(page) {
      const meeting = await first(page, "/api/council-meetings", (entry) => entry.startedAt && !entry.closedAt);
      await page.goto(`/app/meetings/${meeting.id}/live`);
      await page.getByTestId("live-recusal-info").first().click();
      await page.getByTestId("agenda-item-recusal-open").first().click();
      await visible(page, "recusal-form");
    },
  },
  {
    id: "mode-seance-appel",
    title: "Mode séance, appel",
    scenario: "preparation",
    /** The meeting in preparation, prepared and convened as an officer does it, then opened in meeting mode. */
    async open(page) {
      const meeting = await convenedMeeting(page);
      await page.goto(`/app/meetings/${meeting.id}/live`);
      await visible(page, "live-rollcall-heading");
    },
  },
  {
    id: "mode-seance-vote",
    title: "Mode séance, point en vote",
    scenario: "preparation",
    /**
     * The meeting in preparation, convened, opened with every member present, its first point started and its vote
     * open; the panel records nothing until a vote is entered.
     */
    async open(page) {
      const meeting = await convenedMeeting(page);
      await page.goto(`/app/meetings/${meeting.id}/live`);
      const call = page.getByTestId("live-attendance-all-present");
      if (
        await call
          .waitFor({ state: "visible", timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await call.click();
        await page.getByTestId("live-meeting-start").click();
      }
      await page.getByTestId("live-agenda-start").first().click();
      await page.getByTestId("live-ballot-open").first().click();
      await visible(page, "live-ballot-all-for");
    },
  },
  { id: "proces-verbaux", title: "Procès-verbaux", scenario: "minutes", open: route("/minutes") },
  {
    id: "proces-verbal",
    title: "Procès-verbal",
    scenario: "minutes",
    open: detail("/api/minutes", (minutes) => `/minutes/${minutes.id}`),
  },
  {
    id: "proces-verbal-brouillon",
    title: "Procès-verbal en brouillon",
    scenario: "minutes",
    open: detail(
      "/api/minutes",
      (minutes) => `/minutes/${minutes.id}`,
      (minutes) => !minutes.generatedAt,
    ),
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
    id: "affaire-sujets",
    title: "Affaire avec éléments préparés",
    scenario: "minutes",
    async open(page) {
      const subjects = await items(page, "/api/council-business/prepared-subjects");
      const subject = subjects.find((entry) => entry.councilBusinessId);
      if (!subject) throw new Error("No prepared subject names its business");
      await page.goto(`/app/workspace?councilBusiness=${subject.councilBusinessId}`);
    },
  },
  {
    id: "fenetre-document",
    title: "Fenêtre d'un document",
    scenario: "minutes",
    /* A modal dialog keeps the menu behind it: the dialog is opened again at every width. */
    reopenAtEveryWidth: true,
    /** The document dialog opened from an affaire, as a council member opens one of its documents. */
    async open(page) {
      for (const business of await items(page, "/api/council-business")) {
        await page.goto(`/app/workspace?councilBusiness=${business.id}`);
        const view = page.locator('[data-testid^="business-document-view-"]').first();
        if (!(await view.isVisible({ timeout: 5_000 }).catch(() => false))) continue;
        await view.click();
        await visible(page, "resource-preview");
        return;
      }
      throw new Error("No affaire shows a document to open");
    },
  },
  {
    id: "menu-nouveau",
    title: "Menu « Nouveau »",
    scenario: "minutes",
    reopenAtEveryWidth: true,
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
  { id: "courriels", title: "Courriels", scenario: "minutes", open: route("/mail") },
  {
    id: "brouillon",
    title: "Brouillon ouvert",
    scenario: "minutes",
    /** Creates a draft in the disposable database, so that its composer and the « Joindre » menu are measured. */
    async open(page) {
      await page.goto("/app/mail");
      // With one type to create, « Nouveau » creates the draft directly and opens its composer.
      await page.getByTestId("mail-new").first().click();
      await page.getByTestId("mail-composer").waitFor({ state: "visible", timeout: 15_000 });
    },
  },
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
  {
    id: "utilisateur-creation",
    title: "Création d'un utilisateur",
    scenario: "minutes",
    reopenAtEveryWidth: true,
    async open(page) {
      await page.goto("/app/users");
      await page.getByTestId("users-add").click();
      await visible(page, "user-access");
    },
  },
  {
    id: "contact-creation",
    title: "Création d'un contact",
    scenario: "minutes",
    reopenAtEveryWidth: true,
    /** A window with its form and its buttons, other than the creation of a user. */
    async open(page) {
      await page.goto("/app/contacts");
      await page.getByTestId("contacts-add").click();
      await visible(page, "contact-create-form");
    },
  },
  { id: "parametres", title: "Paramètres", scenario: "minutes", open: route("/settings") },
  /* Two pages of the help: its index and one article; the other articles share their layout. */
  { id: "aide", title: "Aide", scenario: "minutes", open: route("/docs") },
  { id: "aide-article", title: "Article de l'aide", scenario: "minutes", open: route("/docs/ecrans/documents") },
  {
    id: "menu-plus",
    title: "Feuille « Plus »",
    scenario: "minutes",
    formats: phone,
    reopenAtEveryWidth: true,
    async open(page) {
      await page.goto("/app/");
      await page.getByTestId("phone-navigation-more").click();
      await visible(page, "phone-more");
    },
  },
].map((screen) => ({ formats: all, ...screen }));
