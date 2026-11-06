import { glyphs, type PieceKind, photoThumb, svgIcon } from "./icons";

/**
 * Fiche persistante de l'affaire. Elle reste en haut à droite et prend tour à tour l'apparence des vues de Hall :
 * fiche d'affaire, ordre du jour, mode séance, actes. Tout son état vient de BoardState, calculé par le récit.
 */

export type Face = "business" | "agenda" | "session" | "acts";

/** Une pièce rangée dans un dossier de documents de l'affaire. */
export interface FolderItem {
  key: string;
  kind: PieceKind;
  name: string;
  detail: string;
  folder: string;
}

export interface BoardState {
  p: number;
  face: Face;
  /** Clé de chaque élément arrivé, avec l'instant de son arrivée. */
  landed: Map<string, number>;
  /** Clés des éléments en route vers la fiche : leur place est réservée. */
  coming: Set<string>;
  planCited: boolean;
  agendaFilled: number;
  agendaFrozen: boolean;
  present: number;
  proxy: boolean;
  opened: boolean;
  live: boolean;
  notes: number;
  phase: number;
  yes: number;
  abstain: number;
  confirmed: boolean;
  questionDone: boolean;
  closed: boolean;
  acknowledged: boolean;
  sent: number;
  /** Dossier que l'assistant IA parcourt, éclairé pendant sa lecture. */
  scanning?: string | null;
}

export interface Point {
  x: number;
  y: number;
}

export const folders: { id: string; label: string }[] = [
  { id: "devis", label: "Devis" },
  { id: "budget", label: "Budget" },
  { id: "plans", label: "Plans" },
  { id: "textes", label: "Textes de référence" },
  { id: "courriers", label: "Courriers" },
  { id: "photos", label: "Photos" },
  { id: "carte", label: "Carte" },
];

/** Vignette d'une photo à la place d'un pictogramme. */
function photoTile(title: string, className: string): HTMLElement {
  const tile = document.createElement("span");
  tile.className = className;
  tile.style.backgroundImage = `url("${photoThumb(title)}")`;
  return tile;
}

export function glyphTile(kind: PieceKind, className = "p-glyph"): HTMLElement {
  const tile = document.createElement("span");
  tile.className = className;
  tile.style.color = glyphs[kind].color;
  tile.style.background = glyphs[kind].surface;
  tile.innerHTML = svgIcon(kind);
  return tile;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

interface Row {
  node: HTMLElement;
  glyph: HTMLElement;
  title: HTMLElement;
  detail: HTMLElement;
}

function row(kind: PieceKind, title: string, detail: string, className = "b-row"): Row {
  const node = element("div", className);
  const words = element("span", "b-row-words");
  const titleNode = element("span", "b-row-title", title);
  const detailNode = element("span", "b-row-detail", detail);
  words.append(titleNode, detailNode);
  const glyph = kind === "image" ? photoTile(title, "p-glyph b-photo") : glyphTile(kind);
  node.append(glyph, words);
  return { node, glyph, title: titleNode, detail: detailNode };
}

function head(kind: PieceKind, kicker: string, title: string) {
  const node = element("div", "b-head");
  const words = element("div", "b-head-words");
  const titleNode = element("p", "b-title", title);
  const kickerNode = element("p", "b-kicker", kicker);
  words.append(kickerNode, titleNode);
  const chip = element("span", "b-chip");
  const glyph = glyphTile(kind, "b-head-glyph");
  node.append(glyph, words, chip);
  return { node, chip, glyph, title: titleNode, kicker: kickerNode };
}

const centre = (node: Element): Point => {
  const box = node.getBoundingClientRect();
  return { x: box.left + Math.min(26, box.width / 2), y: box.top + box.height / 2 };
};

const glowOf = (p: number, landedAt: number | undefined) =>
  landedAt === undefined ? 0 : Math.max(0, 1 - (p - landedAt) / 0.03) ** 2;

export function createBoard(root: HTMLElement, items: FolderItem[]) {
  root.replaceChildren();
  const faces: Record<Face, HTMLElement> = {
    business: element("section", "b-face"),
    agenda: element("section", "b-face"),
    session: element("section", "b-face"),
    acts: element("section", "b-face"),
  };
  for (const face of Object.values(faces)) root.append(face);
  const targets = new Map<string, HTMLElement>();

  /* Fiche d'affaire */
  const business = head("business", "Affaire", "Réfection du chemin communal");
  const committee = element("span", "b-tag");
  committee.append(glyphTile("committee", "b-tag-glyph"), element("span", "", "Commission Voirie"));
  business.node.after(committee);
  const report = row("draft", "Rapport", "Présentation du projet aux élus");
  const meeting = row("event", "Rendez-vous sur place", "Mardi 3 novembre, 9 h 30, avec l’entreprise");
  const docsTitle = element("p", "b-section", "Documents");
  const docsCount = element("span", "b-count");
  docsTitle.append(docsCount);
  const folderList = element("div", "b-groups");
  const folderNodes = folders.map((folder) => {
    const node = element("div", "b-group");
    const header = element("div", "b-group-head");
    const icon = element("span", "b-folder");
    const minis = element("span", "b-minis");
    const badge = element("span", "b-badge");
    header.append(icon, element("span", "b-group-label", folder.label), minis, badge);
    const body = element("div", "b-group-body");
    node.append(header, body);
    folderList.append(node);
    return { ...folder, node, icon, minis, badge, body, shown: "" };
  });
  const itemRows = items.map((item) => {
    const entry = row(item.kind, item.name, item.detail);
    const folder = folderNodes.find((f) => f.id === item.folder);
    folder?.body.append(entry.node);
    const mini = item.kind === "image" ? photoTile(item.name, "b-mini b-photo") : glyphTile(item.kind, "b-mini");
    folder?.minis.append(mini);
    targets.set(item.key, entry.node);
    return { item, entry, mini, folder };
  });
  const subjects = element("div", "b-subjects");
  const project = row("matter", "Réfection du chemin communal", "Projet de délibération");
  const question = row("question", "Calendrier des travaux", "Question ouverte");
  subjects.append(project.node, question.node);
  faces.business.append(business.node, committee, report.node, meeting.node, docsTitle, folderList, subjects);
  targets.set("rapport", report.node);
  targets.set("commission", committee);
  targets.set("rendezvous", meeting.node);
  targets.set("projet", project.node);
  targets.set("question", question.node);

  /* Ordre du jour */
  const agenda = head("agenda", "Séance du conseil municipal", "Séance n° 4 · jeudi 12 novembre");
  const points: [PieceKind, string, string, boolean][] = [
    ["draft", "Arrêt du procès-verbal", "Séance précédente", true],
    ["matter", "Budget annexe de l’eau", "Projet de délibération", true],
    ["matter", "Réfection du chemin communal", "Projet de délibération", true],
    ["question", "Calendrier des travaux", "Question ouverte", false],
  ];
  const agendaList = element("ol", "b-agenda");
  const agendaRows = points.map(([kind, title, detail, voted], i) => {
    const item = element("li", "b-point");
    item.append(element("span", "b-number", String(i + 1)), row(kind, title, detail).node);
    if (voted) item.append(element("span", "b-vote", "Soumis au vote"));
    agendaList.append(item);
    return item;
  });
  const meetingDocs = element("p", "b-section", "Pièces de séance");
  const convocation = row("pdf", "Convocation", "Délai : trois jours francs avant la séance");
  const pack = row("pdf", "Dossier de séance", "Ordre du jour, rapports et pièces réunis");
  const share = element("span", "b-vote b-share");
  share.append(glyphTile("share", "b-tag-glyph"), element("span", "", "Partager"));
  pack.node.append(share);
  faces.agenda.append(
    agenda.node,
    element("p", "b-section", "Ordre du jour"),
    agendaList,
    meetingDocs,
    convocation.node,
    pack.node,
  );
  targets.set("convocation", convocation.node);
  targets.set("dossier", pack.node);
  targets.set("agenda-3", agendaRows[2]);

  /* Mode séance */
  const session = head("matter", "Séance du conseil municipal", "Séance n° 4 · jeudi 12 novembre");
  session.chip.classList.add("is-quorum");
  const roll = element("div", "b-roll");
  const seats = Array.from({ length: 11 }, () => {
    const seat = element("span", "b-seat");
    roll.append(seat);
    return seat;
  });
  const rollText = element("p", "b-roll-text");
  const sessionList = element("ol", "b-session-list");
  const sessionItems = points.map(([, title], i) => {
    const item = element("li", "b-session-item");
    const mark = element("span", "b-session-mark", String(i + 1));
    const words = element("span", "b-row-words");
    const status = element("span", "b-session-status");
    words.append(element("span", "b-row-title", title), status);
    item.append(mark, words);
    sessionList.append(item);
    return { item, mark, status };
  });
  const current = element("div", "b-current");
  const currentKicker = element("p", "b-current-kicker", "Point 3 · Projet de délibération");
  const currentTitle = element("p", "b-current-title", "Réfection du chemin communal");
  const stepper = element("ol", "b-stepper");
  const phases = ["À venir", "Débat", "Vote", "Terminé"].map((label) => {
    const step = element("li", "", label);
    stepper.append(step);
    return step;
  });
  const notes = element("div", "b-notes");
  const noteLines = [0.92, 0.78, 0.86, 0.55].map((width) => {
    const line = element("span", "b-note-line");
    line.style.setProperty("--width", String(width));
    notes.append(line);
    return line;
  });
  const tally = element("div", "b-tally");
  const counters = ["Pour", "Contre", "Abstentions"].map((label) => {
    const box = element("div", "b-counter");
    const value = element("strong", "", "0");
    box.append(value, element("span", "", label));
    tally.append(box);
    return value;
  });
  const result = element("p", "b-result");
  current.append(currentKicker, currentTitle, stepper, notes, tally, result);
  const minutes = row("minutes", "Projet de procès-verbal", "Prêt à la clôture");
  minutes.node.classList.add("b-minutes");
  faces.session.append(session.node, roll, rollText, sessionList, current, minutes.node);
  targets.set("pv", minutes.node);
  targets.set("current", currentTitle);

  /* Actes */
  const acts = head("adopted", "Délibération n° 2026-031 · version définitive", "Réfection du chemin communal");
  const decision = row("adopted", "Délibération", "Figée, numérotée et datée");
  const list = row("pdf", "Liste des délibérations", "Pour le panneau d’affichage et le site");
  const nextMinutes = row("minutes", "Procès-verbal", "À approuver en début de prochaine séance");
  const sending = row("send", "Envoi à la préfecture", "PDF prêt pour le contrôle de légalité");
  sending.node.classList.add("b-send");
  const receipt = element("span", "b-row-check");
  receipt.innerHTML = svgIcon("check");
  sending.node.append(receipt);
  faces.acts.append(acts.node, decision.node, list.node, nextMinutes.node, sending.node);
  targets.set("deliberation", decision.node);
  targets.set("liste", list.node);
  targets.set("pv-suite", nextMinutes.node);

  let shownFace: Face | null = null;
  let height = 0;

  function reveal(node: HTMLElement, state: BoardState, key: string) {
    const landedAt = state.landed.get(key);
    const coming = state.coming.has(key);
    node.style.display = landedAt !== undefined || coming ? "" : "none";
    node.style.visibility = landedAt !== undefined ? "visible" : "hidden";
    node.style.setProperty("--glow", glowOf(state.p, landedAt).toFixed(3));
  }

  return {
    update(state: BoardState) {
      const { p } = state;
      if (state.face !== shownFace) {
        shownFace = state.face;
        for (const [name, node] of Object.entries(faces)) node.classList.toggle("is-active", name === state.face);
      }
      const wanted = faces[state.face].scrollHeight;
      if (Math.abs(wanted - height) > 1) {
        height = wanted;
        root.style.height = `${wanted}px`;
      }

      /* Fiche d'affaire */
      business.chip.hidden = true;
      reveal(committee, state, "commission");
      reveal(report.node, state, "rapport");
      report.detail.textContent = state.planCited
        ? "Plan de situation cité dans le texte"
        : "Présentation du projet aux élus";
      reveal(meeting.node, state, "rendezvous");
      reveal(project.node, state, "projet");
      reveal(question.node, state, "question");
      subjects.hidden = !state.landed.has("projet") && !state.coming.has("projet");
      let latest = "";
      let latestAt = -1;
      for (const { item } of itemRows) {
        const started = state.coming.has(item.key) || state.landed.has(item.key);
        if (!started) continue;
        const at = state.landed.get(item.key) ?? 2;
        if (at >= latestAt) {
          latestAt = at;
          latest = item.folder;
        }
      }
      let total = 0;
      for (const folder of folderNodes) {
        const members = itemRows.filter((entry) => entry.item.folder === folder.id);
        const present = members.filter((m) => state.landed.has(m.item.key) || state.coming.has(m.item.key));
        const count = members.filter((m) => state.landed.has(m.item.key)).length;
        total += count;
        folder.node.hidden = present.length === 0;
        const open = folder.id === latest;
        folder.node.classList.toggle("is-open", open);
        const kind: PieceKind = open ? "folderOpen" : "folder";
        if (folder.shown !== kind) {
          folder.shown = kind;
          folder.icon.replaceChildren(glyphTile(kind, "b-folder-glyph"));
        }
        folder.badge.textContent = String(count);
        const last = Math.max(-1, ...members.map((m) => state.landed.get(m.item.key) ?? -1));
        folder.node.style.setProperty(
          "--glow",
          (state.scanning === folder.id ? 0.85 : glowOf(p, last >= 0 ? last : undefined)).toFixed(3),
        );
        folder.node.classList.toggle("is-scanned", state.scanning === folder.id);
      }
      for (const { item, entry, mini } of itemRows) {
        reveal(entry.node, state, item.key);
        mini.style.display = state.landed.has(item.key) ? "" : "none";
      }
      docsTitle.hidden = total === 0 && state.coming.size === 0;
      docsCount.textContent = total > 0 ? ` · ${total}` : "";

      /* Ordre du jour */
      agenda.chip.textContent = state.agendaFrozen ? "Ordre du jour figé" : "En préparation";
      agendaRows[2].classList.toggle("is-empty", state.agendaFilled < 1);
      agendaRows[3].classList.toggle("is-empty", state.agendaFilled < 2);
      reveal(convocation.node, state, "convocation");
      reveal(pack.node, state, "dossier");
      meetingDocs.hidden = !state.landed.has("convocation") && !state.coming.has("convocation");

      /* Séance */
      session.chip.textContent = state.opened ? `Présents : ${state.present} / 11` : `Appel : ${state.present} / 11`;
      seats.forEach((seat, i) => {
        seat.classList.toggle("is-present", i < state.present);
        seat.classList.toggle("is-proxy", state.proxy && i === 10);
      });
      rollText.textContent = state.opened
        ? "Séance ouverte · président et secrétaire présents · un pouvoir"
        : state.present > 0
          ? "Appel en cours"
          : "";
      sessionItems.forEach(({ item, mark, status }, i) => {
        const done = i < 2 || (i === 2 && state.confirmed) || (i === 3 && state.questionDone);
        const isCurrent = !done && ((i === 2 && state.opened) || (i === 3 && state.confirmed));
        item.classList.toggle("is-done", done);
        item.classList.toggle("is-current", isCurrent);
        mark.textContent = done ? "✓" : isCurrent ? "▶" : String(i + 1);
        status.textContent =
          i === 0
            ? "Arrêté · 11 pour"
            : i === 1
              ? "Adoptée · 11 pour"
              : i === 2
                ? state.confirmed
                  ? "Adoptée · 10 pour, 1 abstention"
                  : state.opened
                    ? (["À venir", "Débat", "Vote", "Terminé"][state.phase] ?? "")
                    : "À venir"
                : state.questionDone
                  ? "Débattue, sans vote"
                  : state.confirmed
                    ? "En débat"
                    : "À venir";
      });
      current.hidden = !state.opened;
      phases.forEach((step, i) => {
        step.classList.toggle("is-done", i < state.phase);
        step.classList.toggle("is-current", i === state.phase);
      });
      noteLines.forEach((line, i) => {
        line.style.setProperty("--fill", Math.min(1, Math.max(0, state.notes * 4 - i)).toFixed(3));
      });
      notes.hidden = state.notes <= 0;
      tally.hidden = state.phase < 2;
      counters[0].textContent = String(state.yes);
      counters[1].textContent = "0";
      counters[2].textContent = String(state.abstain);
      result.textContent = state.confirmed ? "Résultat confirmé : adoptée" : "";
      result.classList.toggle("is-adopted", state.confirmed);
      reveal(minutes.node, state, "pv");

      /* Actes */
      acts.chip.textContent = "Adoptée";
      acts.chip.classList.add("is-adopted");
      reveal(decision.node, state, "deliberation");
      reveal(list.node, state, "liste");
      reveal(nextMinutes.node, state, "pv-suite");
      /* Envoi à la préfecture : présent avec le procès-verbal, allumé à l'arrivée du flux, coché à l'accusé */
      sending.node.style.display = state.landed.has("pv-suite") ? "" : "none";
      sending.node.classList.toggle("is-sent", state.sent >= 1);
      sending.node.style.setProperty("--glow", state.sent >= 1 && !state.acknowledged ? "1" : "0");
      receipt.classList.toggle("is-shown", state.acknowledged);
    },
    folderPoint(id: string): Point | null {
      const folder = folderNodes.find((f) => f.id === id);
      if (!folder || folder.node.hidden) return null;
      const box = folder.node.getBoundingClientRect();
      return { x: box.left + 20, y: box.top + Math.min(20, box.height / 2) };
    },
    target(key: string): Point {
      const node = targets.get(key);
      if (!node) return centre(root);
      if (node.style.display === "none" || !node.offsetParent) {
        const item = items.find((entry) => entry.key === key);
        const folder = folderNodes.find((f) => f.id === item?.folder);
        return centre(folder?.node ?? root);
      }
      return centre(node);
    },
  };
}
