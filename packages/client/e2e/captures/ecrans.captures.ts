import type { Page } from "@playwright/test";
import { capture, expect, test } from "./fixtures";

/** Every screen of the "Écrans" section, on the dataset with closed meetings and one meeting in progress. */
const scenario = (process.env.HALL_DOCS_SCENARIO ?? "default") as "preparation" | "default" | "minutes";
test.setTimeout(3 * 60_000);
test.use({ seedScenario: scenario });

interface Entity {
  properties: Record<string, unknown>;
}

async function entities(page: Page, path: string): Promise<Record<string, unknown>[]> {
  const response = await page.request.get(path);
  expect(response.ok(), `${path} answers`).toBeTruthy();
  const body = (await response.json()) as { entities?: Entity[] };
  return (body.entities ?? []).map((entity) => entity.properties);
}

const misses: string[] = [];

/** Opens a screen and captures it; a screen that cannot be reached is reported at the end, not fatal. */
async function open(page: Page, route: string, name: string, settle?: () => Promise<void>) {
  try {
    await page.goto(`/app${route}`);
    await page.waitForLoadState("networkidle");
    if (settle) await settle();
    await page.waitForTimeout(800);
    await capture(page, `ecrans/${name}`);
  } catch (error) {
    await capture(page, `ecrans/${name}-echec`).catch(() => undefined);
    misses.push(`${name} (${route}) : ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
}

test("les écrans de Hall sur le jeu Alésia", async ({ docsPage: page }) => {
  await open(page, "/", "vue-d-ensemble");

  const meetings = await entities(page, "/api/council-meetings");
  const inProgress = meetings.find((meeting) => meeting.startedAt && !meeting.closedAt);
  const closed = meetings.find((meeting) => meeting.closedAt);
  await open(page, "/meetings", "seances");
  if (closed) await open(page, `/meetings/${closed.id}`, "seance-close");
  if (inProgress) {
    await open(page, `/meetings/${inProgress.id}`, "seance-en-cours");
    await open(page, `/meetings/${inProgress.id}/live`, "mode-seance", async () => {
      await expect(page.getByText(/Séance du conseil municipal/i).first()).toBeVisible();
    });
  }

  await open(page, "/minutes", "proces-verbaux");
  const [minutes] = await entities(page, "/api/minutes");
  if (minutes) await open(page, `/minutes/${minutes.id}`, "proces-verbal");

  await open(page, "/council-decisions", "deliberations");
  const [decision] = await entities(page, "/api/council-decisions");
  if (decision) await open(page, `/council-decisions/${decision.id}`, "deliberation");

  await open(page, "/workspace", "espace-de-travail");
  const [business] = await entities(page, "/api/council-business");
  if (business) await open(page, `/workspace?councilBusiness=${business.id}`, "affaire");
  const resources = await entities(page, "/api/resources");
  const byKind = (kind: string) => resources.find((resource) => resource.kind === kind);
  const text = byKind("text");
  if (text) await open(page, `/workspace?resource=${text.id}`, "editeur-de-texte");
  const spreadsheet = byKind("spreadsheet");
  if (spreadsheet) {
    await open(page, `/workspace?resource=${spreadsheet.id}`, "tableur", async () => {
      await expect(page.getByText("Démarrer", { exact: true })).toBeVisible({ timeout: 180_000 });
      await page.waitForTimeout(1500);
    });
  }
  const document = byKind("document");
  if (document) await open(page, `/workspace?resource=${document.id}`, "fichiers-et-pages-web");
  const remote = byKind("remote");
  if (remote) await open(page, `/workspace?resource=${remote.id}`, "ressource-web");
  const geographic = byKind("geographic");
  await open(page, "/maps", "cartes-entree");
  if (geographic) {
    await open(page, `/maps/${geographic.id}`, "cartes", async () => {
      await page.waitForTimeout(2500);
    });
  }

  await open(page, "/calendar", "calendrier");
  await open(page, "/council-committees", "commissions");
  const [committee] = await entities(page, "/api/council-committees");
  if (committee) await open(page, `/council-committees/${committee.id}`, "commission");
  await open(page, "/contacts", "contacts");
  const [contact] = await entities(page, "/api/contacts");
  if (contact) await open(page, `/contacts/${contact.id}`, "contact");
  await open(page, "/council-members", "membres-du-conseil");
  const [member] = await entities(page, "/api/council-members");
  if (member) await open(page, `/council-members/${member.id}`, "membre-du-conseil");
  await open(page, "/users", "utilisateurs");
  await open(page, "/settings", "parametres");
  await open(page, "/docs", "documentation");
  expect(misses, "écrans non capturés").toEqual([]);
});
