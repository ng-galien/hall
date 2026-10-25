const state = { data: null, search: "", theme: "", evidence: "" };
const elements = {
  summary: document.querySelector(".summary"),
  search: document.querySelector("#search"),
  themeFilter: document.querySelector("#theme-filter"),
  evidenceFilter: document.querySelector("#evidence-filter"),
  chart: document.querySelector("#theme-chart"),
  requirements: document.querySelector("#requirements"),
  resultCount: document.querySelector("#result-count"),
  template: document.querySelector("#requirement-template"),
};

function evidenceBadge(label, active) {
  return `<span class="badge ${active ? "active" : ""}"><i></i>${label}</span>`;
}

function statementOf(requirement) {
  return requirement.statement ?? requirement.clauses.map(clause => clause.statement).join(" ");
}

function filteredRequirements() {
  const query = state.search.trim().toLocaleLowerCase("fr");
  return state.data.requirements.filter(requirement => {
    const matchesQuery = !query || [requirement.id, requirement.name, statementOf(requirement)]
      .some(value => value.toLocaleLowerCase("fr").includes(query));
    const matchesTheme = !state.theme || requirement.theme === state.theme;
    const matchesEvidence = !state.evidence
      || (state.evidence === "unimplemented" ? !requirement.evidence.implemented : requirement.evidence[state.evidence]);
    return matchesQuery && matchesTheme && matchesEvidence;
  });
}

function renderSummary() {
  const { summary } = state.data;
  const items = [
    ["Exigences", summary.requirements],
    ["Implémentées", summary.implemented],
    ["Marquées par un test", summary.verified],
    ["Au backlog", summary.tracked],
  ];
  elements.summary.innerHTML = items.map(([label, value]) =>
    `<article><strong>${value}</strong><span>${label}</span></article>`
  ).join("");
}

function renderChart() {
  const counts = Object.fromEntries(Object.keys(state.data.themes).map(theme => [theme, 0]));
  for (const requirement of state.data.requirements) counts[requirement.theme] += 1;
  const maximum = Math.max(...Object.values(counts));
  elements.chart.innerHTML = Object.entries(state.data.themes).map(([id, theme]) => `
    <button type="button" data-theme="${id}" aria-label="Filtrer sur ${theme.label}">
      <span>${theme.label}</span>
      <i><b style="width:${Math.max(4, counts[id] / maximum * 100)}%"></b></i>
      <strong>${counts[id]}</strong>
    </button>
  `).join("");
  elements.chart.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      state.theme = button.dataset.theme;
      elements.themeFilter.value = state.theme;
      renderRequirements();
    });
  });
}

function themeOptions(selected) {
  return Object.entries(state.data.themes).map(([id, theme]) =>
    `<option value="${id}" ${id === selected ? "selected" : ""}>${theme.label}</option>`
  ).join("");
}

async function changeTheme(requirement, select, status) {
  const previous = requirement.theme;
  select.disabled = true;
  status.textContent = "Enregistrement…";
  try {
    const response = await fetch(`/api/requirements/${requirement.id}/theme`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: select.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    requirement.theme = result.theme;
    status.textContent = "Classement enregistré";
    renderChart();
  } catch (error) {
    requirement.theme = previous;
    select.value = previous;
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    select.disabled = false;
  }
}

function renderRequirements() {
  const requirements = filteredRequirements();
  elements.resultCount.textContent = `${requirements.length} résultat${requirements.length > 1 ? "s" : ""}`;
  elements.requirements.replaceChildren(...requirements.map(requirement => {
    const fragment = elements.template.content.cloneNode(true);
    const card = fragment.querySelector(".requirement-card");
    card.dataset.testid = `requirement-card-${requirement.id}`;
    fragment.querySelector(".requirement-id").textContent = requirement.id;
    fragment.querySelector(".requirement-statement").textContent = statementOf(requirement);
    fragment.querySelector(".requirement-name").textContent = requirement.name;
    fragment.querySelector(".nature").textContent = requirement.nature === "functional" ? "Fonctionnelle" : "Technique";
    const criteria = fragment.querySelector(".criteria");
    const values = requirement.acceptanceCriteria ?? [];
    criteria.hidden = values.length === 0;
    criteria.innerHTML = values.map(value => `<li>${value}</li>`).join("");
    fragment.querySelector(".evidence").innerHTML = [
      evidenceBadge("Implémentée", requirement.evidence.implemented),
      evidenceBadge("Marquée par un test", requirement.evidence.verified),
      evidenceBadge("Backlog", requirement.evidence.tracked),
    ].join("");
    const select = fragment.querySelector(".theme-choice select");
    select.dataset.testid = `requirement-theme-${requirement.id}`;
    select.innerHTML = themeOptions(requirement.theme);
    const saveStatus = fragment.querySelector(".save-status");
    select.addEventListener("change", () => changeTheme(requirement, select, saveStatus));
    return fragment;
  }));
}

async function load() {
  const response = await fetch("/api/catalog");
  state.data = await response.json();
  elements.themeFilter.innerHTML = `<option value="">Tous les thèmes</option>${themeOptions("")}`;
  renderSummary();
  renderChart();
  renderRequirements();
}

elements.search.addEventListener("input", event => {
  state.search = event.currentTarget.value;
  renderRequirements();
});
elements.themeFilter.addEventListener("change", event => {
  state.theme = event.currentTarget.value;
  renderRequirements();
});
elements.evidenceFilter.addEventListener("change", event => {
  state.evidence = event.currentTarget.value;
  renderRequirements();
});

load().catch(error => {
  elements.requirements.textContent = `Impossible de charger le catalogue : ${error.message}`;
});
