import release from "virtual:hall-release";
import {
  type DownloadKey,
  detectedDownload,
  downloadLabels,
  megabytes,
  type ReleaseFile,
  releasesUrl,
  serverGuideUrl,
} from "./downloads";
import { type InstallationGuide, installationGuides, installationIntroduction } from "./installation";
import { siteRoot } from "./site-root";

export const documentationUrl = `${siteRoot}documentation/index.html#/docs`;

type System = InstallationGuide["system"];

/** Commandes à copier citées dans le guide : elles sont mises en forme et reçoivent un bouton « Copier ». */
const COMMAND = /(sudo (?:apt|dnf) install (?:"[^"]*"\S*|\S+)|xattr -dr \S+ \/\S+?)(?=\.?(?:\s|$))/g;

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

const guideSystem: Record<DownloadKey, System | null> = {
  windows: "windows",
  "macos-arm64": "macos",
  "macos-x64": "macos",
  "linux-deb": "linux",
  "linux-rpm": "linux",
  server: null,
};

const order: readonly DownloadKey[] = ["windows", "macos-arm64", "macos-x64", "linux-deb", "linux-rpm", "server"];

/** Fichiers à proposer : le système détecté d'abord, le serveur en dernier. */
function orderedFiles(detected: DownloadKey | null): DownloadKey[] {
  return detected ? [detected, ...order.filter((key) => key !== detected)] : [...order];
}

function fileOf(key: DownloadKey): ReleaseFile | null {
  return release?.files.find((file) => file.key === key) ?? null;
}

function fileLink(key: DownloadKey, className: string, text: string, testId: string): HTMLAnchorElement {
  const file = fileOf(key);
  const link = node("a", className, text, testId);
  link.href = file?.url ?? releasesUrl;
  if (file) link.setAttribute("download", file.name);
  return link;
}

function metaText(key: DownloadKey): string {
  const file = fileOf(key);
  return file && release ? `Version ${release.version} · ${megabytes(file.size)}` : "Page des versions sur GitHub";
}

/** Liens discrets sous la liste : toutes les versions, empreintes, guide d'utilisation. */
function otherLinks(className: string, withDocumentation: boolean): HTMLElement {
  const line = node("p", className, undefined, "download-other-links");
  const all = node("a", "link-plain", "Toutes les versions", "download-all-versions");
  all.href = releasesUrl;
  line.append(all);
  if (release?.checksums) {
    const sums = node("a", "link-plain", "Empreintes SHA-256", "download-checksums");
    sums.href = release.checksums;
    line.append(sums);
  }
  if (withDocumentation) {
    const guide = node("a", "link-plain", "Guide d’utilisation", "download-documentation");
    guide.href = documentationUrl;
    line.append(guide);
  }
  return line;
}

/** Liste des fichiers de la dernière version, chacun avec son bouton de téléchargement direct. */
function renderDownload(
  inner: HTMLElement,
  detected: DownloadKey | null,
  guideHref: string,
  withDocumentation: boolean,
): (install: InstallTabs) => void {
  const head = node("header", "section-head");
  head.append(
    node("p", "section-axis", release ? `Version ${release.version}` : "Dernière version"),
    node("h2", undefined, "Télécharger Hall"),
    node(
      "p",
      "section-lead",
      "La démonstration s’installe sur votre ordinateur, avec deux jeux au choix : Foncine-le-Bas et Alésia. Elle est gratuite et fonctionne sans connexion : rien n’est envoyé sur Internet.",
    ),
  );
  const list = node("ul", "download-list");
  const hows: { system: System; how: HTMLAnchorElement }[] = [];
  for (const key of orderedFiles(detected)) {
    const label = downloadLabels[key];
    const row = node("li", "download-row", undefined, `download-${key}`);
    if (key === detected) row.classList.add("is-detected");
    const system = node("div", "download-system");
    system.append(node("h3", undefined, label.system), node("p", undefined, label.detail));
    const file = node("p", "download-file");
    file.append(
      node("span", "download-file-name", fileOf(key)?.name ?? label.format),
      node("span", "download-file-meta", metaText(key)),
    );
    const actions = node("div", "download-actions");
    actions.append(fileLink(key, "button-primary", "Télécharger", `download-link-${key}`));
    const guided = guideSystem[key];
    if (guided) {
      const how = node("a", "link-plain", "Marche à suivre", `download-how-${key}`);
      how.href = guideHref;
      hows.push({ system: guided, how });
      actions.append(how);
    } else {
      const how = node("a", "link-plain", "Installer le serveur", "download-how-server");
      how.href = serverGuideUrl;
      actions.append(how);
    }
    row.append(system, file, actions);
    list.append(row);
  }
  inner.append(head, list, otherLinks("download-more", withDocumentation));
  return (install) => {
    for (const { system, how } of hows) how.addEventListener("click", () => install.select(system));
  };
}

/** Téléchargement de l'ouverture : le système détecté en premier, les autres à côté, la marche à suivre. */
function renderHeroDownload(root: HTMLElement, detected: DownloadKey | null, install: InstallTabs) {
  const main = detected
    ? fileLink(detected, "site-primary-action p-get-main", "Télécharger la démonstration", "hero-download-main")
    : node("a", "site-primary-action p-get-main", "Télécharger pour un ordinateur", "hero-download-main");
  if (!detected) main.setAttribute("href", "#telecharger");
  const meta = node(
    "p",
    "p-get-meta",
    detected
      ? `${downloadLabels[detected].system} · ${metaText(detected).replace("Version", "version")}`
      : `Windows, Mac et Linux${release ? ` · version ${release.version}` : ""}`,
    "hero-download-meta",
  );
  root.append(main, meta);
  if (detected) {
    const others = node("p", "p-get-others", undefined, "hero-download-others");
    others.append(node("span", undefined, "Autres systèmes :"));
    for (const key of order) {
      if (key === detected || key === "server") continue;
      others.append(fileLink(key, "link-plain", downloadLabels[key].short, `hero-download-${key}`));
    }
    root.append(others);
  }
  const links = node("p", "p-get-links");
  const how = node("a", "link-plain", "Marche à suivre, application non signée", "hero-download-how");
  how.href = "#marche-a-suivre";
  const system = detected ? guideSystem[detected] : null;
  if (system) how.addEventListener("click", () => install.select(system));
  const all = node("a", "link-plain", "Serveur et toutes les versions", "hero-download-all");
  all.href = "#telecharger";
  links.append(how, all);
  root.append(links);
}

/** Page d'accueil : téléchargement à l'ouverture, section Télécharger avec la marche à suivre. */
export async function renderHomeDownloads() {
  const section = document.querySelector<HTMLElement>('[data-testid="section-telecharger"]');
  const hero = document.querySelector<HTMLElement>('[data-testid="hero-download"]');
  if (!section) return;
  const detected = await detectedDownload();
  const inner = node("div", "section-inner");
  section.append(inner);
  const connect = renderDownload(inner, detected, "#marche-a-suivre", true);
  const install = node("div", "section-inner section-card-install");
  section.append(install);
  const tabs = renderInstall(install);
  connect(tabs);
  if (hero) renderHeroDownload(hero, detected, tabs);
}

/** Page Alésia : les mêmes fichiers, la marche à suivre sur la page d'accueil ; marque la section visible. */
export async function renderSections() {
  const download = document.querySelector<HTMLElement>('[data-testid="section-telecharger"]');
  if (!download) return;
  const inner = node("div", "section-inner");
  download.append(inner);
  renderDownload(inner, await detectedDownload(), "../#marche-a-suivre", false);

  const links = new Map<string, HTMLElement>();
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    '.section-nav a[href^="#"]:not([aria-current="page"])',
  )) {
    links.set(link.hash.slice(1), link);
  }
  let queued = false;
  function update() {
    queued = false;
    const line = window.innerHeight * 0.4;
    let best = "decouvrir";
    for (const id of ["telecharger", "documentation"]) {
      const section = document.getElementById(id);
      if (section && section.getBoundingClientRect().top < line) best = id;
    }
    for (const [id, link] of links) {
      if (id === best) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
  }
  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  update();
}

/** Remplissage des étapes de la marche à suivre au fil du défilement. */
export function followInstallSteps() {
  const lists = [...document.querySelectorAll<HTMLElement>(".install-steps")];
  let queued = false;
  function update() {
    queued = false;
    const reach = window.innerHeight * 0.62;
    for (const list of lists) {
      if (list.offsetParent === null) continue;
      const box = list.getBoundingClientRect();
      list.style.setProperty("--fill", `${Math.max(0, Math.min(box.height, reach - box.top))}px`);
      for (const item of list.children) {
        (item as HTMLElement).classList.toggle("is-reached", item.getBoundingClientRect().top + 14 < reach);
      }
    }
  }
  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  for (const tab of document.querySelectorAll(".install-tab")) tab.addEventListener("click", request);
  update();
}
