import { type InstallationGuide, installationGuides, installationIntroduction } from "./installation";

export const releasesUrl = "https://github.com/ng-galien/hall/releases";
export const documentationUrl = "https://github.com/ng-galien/hall/tree/main/packages/client/src/docs/content/fr";

type System = InstallationGuide["system"];

/** Commandes à copier citées dans le guide : elles sont mises en forme et reçoivent un bouton « Copier ». */
const COMMAND = /(sudo (?:apt|dnf) install \S+|xattr -dr \S+ \/\S+?)(?=\.?(?:\s|$))/g;

/** Espaces insécables de la typographie française devant : ; ? ! » et après «. */
function frenchSpacing(text: string): string {
  return text.replace(/ ([:;?!»])/g, " $1").replace(/« /g, "« ");
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
  testId?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = frenchSpacing(text);
  if (testId) element.dataset.testid = testId;
  return element;
}

function copyButton(command: string): HTMLButtonElement {
  const button = node("button", "copy-button", "Copier", "copy-command");
  button.type = "button";
  button.setAttribute("aria-label", `Copier la commande ${command}`);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(command);
      button.textContent = "Copié";
    } catch {
      button.textContent = "Sélectionnez la commande";
    }
    window.setTimeout(() => {
      button.textContent = "Copier";
    }, 2000);
  });
  return button;
}

/** Paragraphe du guide dont les commandes à copier sont isolées dans un bloc de code. */
function guideText(text: string): HTMLElement {
  const paragraph = node("p", "guide-text");
  let last = 0;
  for (const match of text.matchAll(COMMAND)) {
    const at = match.index ?? 0;
    if (at > last) paragraph.append(frenchSpacing(text.slice(last, at)));
    const command = match[0];
    const block = node("span", "command");
    block.append(node("code", undefined, undefined, "command-text"), copyButton(command));
    (block.firstChild as HTMLElement).textContent = command;
    paragraph.append(block);
    last = at + command.length;
  }
  if (last < text.length) paragraph.append(frenchSpacing(text.slice(last)));
  return paragraph;
}

function detectedSystem(): System {
  const agent = `${navigator.userAgent} ${navigator.platform}`;
  if (/Mac|iPhone|iPad/i.test(agent)) return "macos";
  if (/Linux/i.test(agent) && !/Android/i.test(agent)) return "linux";
  return "windows";
}

interface InstallTabs {
  select: (system: System) => void;
}

function renderInstall(inner: HTMLElement): InstallTabs {
  const part = node("div", "install-part", undefined, "install-part");
  part.id = "marche-a-suivre";
  const head = node("header", "install-head");
  head.append(
    node("h3", undefined, "Marche à suivre"),
    node("p", "section-lead", "Choisissez votre système, puis suivez les étapes dans l’ordre."),
  );
  const before = node("ul", "install-before", undefined, "install-introduction");
  for (const line of installationIntroduction) before.append(node("li", undefined, line));
  const tabs = node("div", "install-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Système de l’ordinateur");
  const panels = node("div", "install-panels");
  const entries: { system: System; tab: HTMLButtonElement; panel: HTMLElement }[] = [];

  function select(system: System) {
    for (const entry of entries) {
      const chosen = entry.system === system;
      entry.tab.setAttribute("aria-selected", String(chosen));
      entry.tab.tabIndex = chosen ? 0 : -1;
      entry.panel.hidden = !chosen;
    }
  }

  for (const guide of installationGuides) {
    const tab = node("button", "install-tab", guide.title, `install-tab-${guide.system}`);
    tab.type = "button";
    tab.id = `installer-onglet-${guide.system}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `installer-${guide.system}`);
    tab.addEventListener("click", () => select(guide.system));
    tab.addEventListener("keydown", (event) => {
      const index = entries.findIndex((entry) => entry.system === guide.system);
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      const next = entries[(index + step + entries.length) % entries.length];
      select(next.system);
      next.tab.focus();
    });
    tabs.append(tab);

    const panel = node("div", "install-panel", undefined, `install-panel-${guide.system}`);
    panel.id = `installer-${guide.system}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    const facts = node("dl", "install-facts");
    facts.append(
      node("dt", undefined, "Versions"),
      node("dd", undefined, guide.versions),
      node("dt", undefined, "Fichier à télécharger"),
      node("dd", undefined, guide.download),
    );
    panel.append(facts);
    for (const path of guide.paths) {
      const block = node("section", "install-path");
      block.append(node("h4", undefined, path.title));
      const steps = node("ol", "install-steps");
      for (const step of path.steps) {
        const item = node("li", "install-step", undefined, "install-step");
        const sees = node("div", "install-sees");
        sees.append(node("span", "install-label", "À l’écran"), guideText(step.sees));
        const does = node("div", "install-does");
        does.append(node("span", "install-label", "À faire"), guideText(step.does));
        item.append(sees, does);
        steps.append(item);
      }
      block.append(steps);
      panel.append(block);
    }
    if (guide.notes.length > 0) {
      const notes = node("section", "install-notes");
      notes.append(node("h4", undefined, "Bon à savoir"));
      const list = node("ul");
      for (const note of guide.notes) {
        const item = node("li", undefined, undefined, "install-note");
        item.append(guideText(note));
        list.append(item);
      }
      notes.append(list);
      panel.append(notes);
    }
    panels.append(panel);
    entries.push({ system: guide.system, tab, panel });
  }
  part.append(head, before, tabs, panels);
  inner.append(part);
  select(detectedSystem());
  return { select };
}

function renderDownload(inner: HTMLElement): (install: InstallTabs) => void {
  const head = node("header", "section-head");
  head.append(
    node("h2", undefined, "Télécharger la démonstration"),
    node(
      "p",
      "section-lead",
      "Hall s’installe sur votre ordinateur avec la commune d’Alésia, son conseil et ses affaires. La démonstration est gratuite et fonctionne sans connexion.",
    ),
  );
  const list = node("ul", "download-list");
  const hows: { system: System; how: HTMLAnchorElement }[] = [];
  for (const guide of installationGuides) {
    const row = node("li", "download-row", undefined, `download-${guide.system}`);
    const system = node("div", "download-system");
    system.append(node("h3", undefined, guide.title), node("p", undefined, guide.versions));
    const file = node("p", "download-file", guide.download);
    const actions = node("div", "download-actions");
    const link = node("a", "button-primary", `Télécharger pour ${guide.title}`, `download-link-${guide.system}`);
    link.href = releasesUrl;
    const how = node("a", "link-plain", `Marche à suivre pour ${guide.title}`, `download-how-${guide.system}`);
    how.href = "#marche-a-suivre";
    hows.push({ system: guide.system, how });
    actions.append(link, how);
    row.append(system, file, actions);
    list.append(row);
  }
  const warning = node(
    "p",
    "download-warning",
    "À la première ouverture, l’ordinateur affiche un avertissement parce que Hall n’est pas signé auprès d’Apple ni de Microsoft. La marche à suivre ci-dessous montre quoi faire, écran par écran.",
  );
  inner.append(head, list, warning);
  return (install) => {
    for (const { system, how } of hows) how.addEventListener("click", () => install.select(system));
  };
}

/** Construit la section Télécharger, fichiers puis marche à suivre, et marque la section visible dans l'en-tête. */
export function renderSections() {
  const download = document.querySelector<HTMLElement>('[data-testid="section-telecharger"]');
  if (!download) return;
  const inner = node("div", "section-inner");
  download.append(inner);
  const connect = renderDownload(inner);
  connect(renderInstall(inner));

  const links = new Map<string, HTMLElement>();
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".section-nav a")) {
    links.set(link.hash.slice(1), link);
  }
  const visible = new Map<string, number>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRect.height : 0);
      let best = "";
      let ratio = 0;
      for (const [id, value] of visible) {
        if (value > ratio) {
          best = id;
          ratio = value;
        }
      }
      for (const [id, link] of links) {
        if (id === best) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
    },
    { rootMargin: "-30% 0px -40% 0px", threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
  );
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  }
}
