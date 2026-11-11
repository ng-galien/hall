import { raster } from "../geometry.mjs";

/*
 * Exploratory rules on repeated list items: at least `minimumItems` siblings of the same element key, each wider than
 * `minimumWidth` of the screen and holding at least two visible leaves. One finding per list, on its first item; the
 * value is the median over the items of the list.
 */

function children(snapshot) {
  const map = new Map();
  snapshot.elements.forEach((entry, index) => {
    if (!map.has(entry.parent)) map.set(entry.parent, []);
    map.get(entry.parent).push(index);
  });
  return map;
}

function leavesOf(snapshot, childMap, root) {
  const leaves = [];
  const stack = [...(childMap.get(root) ?? [])];
  while (stack.length) {
    const index = stack.pop();
    const entry = snapshot.elements[index];
    if (entry.textRect) leaves.push({ entry, rect: entry.textRect, kind: "text" });
    else if (entry.isSvg || ["img", "input", "select", "textarea"].includes(entry.tag))
      leaves.push({ entry, rect: entry.visibleRect, kind: "media" });
    stack.push(...(childMap.get(index) ?? []));
  }
  return leaves.filter((leaf) => leaf.rect.w >= 1 && leaf.rect.h >= 1);
}

/** Repeated list items of the snapshot, grouped by list; the trailing position of a sibling key is ignored. */
export function listItems(snapshot, params) {
  const childMap = children(snapshot);
  const lists = [];
  for (const [parent, indexes] of childMap) {
    if (parent < 0) continue;
    const byKey = new Map();
    for (const index of indexes) {
      const entry = snapshot.elements[index];
      if (entry.rect.w < snapshot.viewport.width * params.minimumWidth || entry.rect.h < 24) continue;
      const signature = entry.key.replace(/:\d+$/, "");
      if (!byKey.has(signature)) byKey.set(signature, []);
      byKey.get(signature).push(index);
    }
    for (const group of byKey.values()) {
      if (group.length < params.minimumItems) continue;
      const items = group
        .map((index) => ({ index, entry: snapshot.elements[index], leaves: leavesOf(snapshot, childMap, index) }))
        .filter((item) => item.leaves.length >= 2);
      if (items.length >= params.minimumItems) lists.push(items);
    }
  }
  return lists;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Distinct horizontal bands occupied by the item's texts and icons. */
function rows(item) {
  const bands = [];
  for (const leaf of [...item.leaves].sort((a, b) => a.rect.y - b.rect.y)) {
    const middle = leaf.rect.y + leaf.rect.h / 2;
    const band = bands.find((entry) => middle >= entry.top && middle <= entry.bottom);
    if (band) band.leaves.push(leaf);
    else bands.push({ top: leaf.rect.y, bottom: leaf.rect.y + leaf.rect.h, leaves: [leaf] });
  }
  return bands;
}

const listDefaults = { minimumItems: 3, minimumWidth: 0.5 };

export const listItemFill = {
  id: "list-item-fill",
  family: "lists",
  kind: "element",
  exploratory: true,
  title: "Élément de liste peu rempli",
  explanation:
    "Part de la surface d'un élément répété de liste couverte par ses textes et icônes (médiane sur la liste) ; une valeur basse signale un élément haut ou large pour peu de contenu.",
  unit: "%",
  defaults: { formats: "all", severity: "indicator", params: { ...listDefaults, minimum: 20 } },
  evaluate({ snapshot, params }) {
    return listItems(snapshot, params).flatMap((items) => {
      const fills = items.map((item) => {
        const box = item.entry.visibleRect;
        const shifted = item.leaves.map((leaf) => ({ ...leaf.rect, x: leaf.rect.x - box.x, y: leaf.rect.y - box.y }));
        const local = { viewport: { width: box.w, height: box.h } };
        const { grid, columns, rows: count } = raster(local, shifted, 2);
        const covered = grid.reduce((sum, row) => sum + row.reduce((total, value) => total + value, 0), 0);
        return Math.round((covered / (columns * count)) * 100);
      });
      const value = median(fills);
      return value < params.minimum
        ? [{ index: items[0].index, value, threshold: params.minimum, detail: `${items.length} éléments` }]
        : [];
    });
  },
};

export const listItemLoneSmall = {
  id: "list-item-lone-small",
  family: "lists",
  kind: "element",
  exploratory: true,
  title: "Petit élément seul sur sa rangée",
  explanation:
    "Dans un élément répété de liste, une icône ou un texte plus étroit que la largeur maximale occupe seul une rangée entière.",
  unit: "px",
  defaults: { formats: "all", severity: "indicator", params: { ...listDefaults, maximumWidth: 32 } },
  evaluate({ snapshot, params }) {
    return listItems(snapshot, params).flatMap((items) => {
      const lone = items
        .map((item) =>
          rows(item).find((band) => band.leaves.length === 1 && band.leaves[0].rect.w < params.maximumWidth),
        )
        .filter(Boolean);
      if (lone.length * 2 < items.length) return [];
      const leaf = lone[0].leaves[0];
      return [
        {
          index: snapshot.elements.indexOf(leaf.entry),
          value: Math.round(leaf.rect.w),
          threshold: params.maximumWidth,
          detail: `seul sur sa rangée dans ${lone.length} élément(s) sur ${items.length}`,
        },
      ];
    });
  },
};

export const listItemHeightPerRow = {
  id: "list-item-height-per-row",
  family: "lists",
  kind: "element",
  exploratory: true,
  title: "Élément de liste haut pour son contenu",
  explanation:
    "Hauteur d'un élément répété de liste divisée par le nombre de rangées de texte et d'icônes qu'il porte (médiane sur la liste).",
  unit: "px/rangée",
  defaults: { formats: "all", severity: "indicator", params: { ...listDefaults, maximum: 40 } },
  evaluate({ snapshot, params }) {
    return listItems(snapshot, params).flatMap((items) => {
      const value = median(items.map((item) => Math.round(item.entry.rect.h / Math.max(1, rows(item).length))));
      return value > params.maximum
        ? [{ index: items[0].index, value, threshold: params.maximum, detail: `${items.length} éléments` }]
        : [];
    });
  },
};

export const listItemTrailingIcon = {
  id: "list-item-trailing-icon",
  family: "lists",
  kind: "element",
  exploratory: true,
  title: "Signe en bout de ligne déjà cliquable",
  explanation:
    "Un élément répété de liste entièrement cliquable se termine par une petite icône sans libellé au bord droit (chevron ou flèche) : un signe décoratif qui ne déclenche rien de plus que la ligne.",
  unit: "px",
  defaults: { formats: "all", severity: "indicator", params: { ...listDefaults, edge: 24, maximumIcon: 24 } },
  evaluate({ snapshot, params }) {
    return listItems(snapshot, params).flatMap((items) => {
      const trailing = items
        .filter((item) => item.entry.interactive)
        .map((item) => {
          const right = item.entry.visibleRect.x + item.entry.visibleRect.w;
          return item.leaves.find(
            (leaf) =>
              leaf.entry.isSvg &&
              !leaf.entry.interactive &&
              Math.max(leaf.rect.w, leaf.rect.h) <= params.maximumIcon &&
              right - (leaf.rect.x + leaf.rect.w) <= params.edge &&
              !item.leaves.some((other) => other !== leaf && other.rect.x > leaf.rect.x),
          );
        })
        .filter(Boolean);
      if (trailing.length * 2 < items.length) return [];
      const leaf = trailing[0];
      return [
        {
          index: snapshot.elements.indexOf(leaf.entry),
          value: Math.round(Math.max(leaf.rect.w, leaf.rect.h)),
          threshold: params.maximumIcon,
          detail: `${trailing.length} élément(s) sur ${items.length}`,
        },
      ];
    });
  },
};

/** True when the element or one of its ancestors carries the given `data-slot`. */
function insideSlot(snapshot, index, slot) {
  for (let current = index; current >= 0; current = snapshot.elements[current].parent) {
    if (snapshot.elements[current].slot === slot) return true;
  }
  return false;
}

export const listRowLegacy = {
  id: "list-row-legacy",
  family: "lists",
  kind: "element",
  exploratory: false,
  title: "Ligne de liste écrite à la main",
  explanation:
    "Un élément répété de liste qui n'est pas rendu par le composant partagé ListRow (data-slot=\"list-row\" sur lui ou sur un ancêtre). Une liste de moins de trois éléments n'est pas comptée.",
  unit: "éléments",
  defaults: { formats: "all", severity: "indicator", params: { ...listDefaults, rowSlot: "list-row" } },
  evaluate({ snapshot, params }) {
    return listItems(snapshot, params).flatMap((items) => {
      const legacy = items.filter((item) => !insideSlot(snapshot, item.index, params.rowSlot));
      return legacy.length > 0
        ? [
            {
              index: legacy[0].index,
              value: legacy.length,
              threshold: 0,
              detail: `${legacy.length} élément(s) sur ${items.length}`,
            },
          ]
        : [];
    });
  },
};

export const listRules = [listItemFill, listItemLoneSmall, listItemHeightPerRow, listItemTrailingIcon, listRowLegacy];
