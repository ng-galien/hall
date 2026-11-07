/** Editable Jinja sources produce Markdown; Hall owns the subsequent Markdown/PDF rendering. */
export const jinjaMinutesFacts = `Séance n° {{ minutes.meeting.number }}  
Ouverture : {{ minutes.meeting.startedAt | datetime }}  
Clôture : {{ minutes.meeting.closedAt | datetime }}  
Lieu : {{ (minutes.meeting.location or 'Non renseigné') | text }}

Présidence : {{ (minutes.meeting.chair.name if minutes.meeting.chair else 'Non renseignée') | text }}  
Secrétariat : {{ (minutes.meeting.secretary.name if minutes.meeting.secretary else 'Non renseigné') | text }}

{% for observation in minutes.conduct.quorumObservations if observation.agendaItemId == none %}
Quorum à l’ouverture : {{ {'met': 'atteint', 'notMet': 'non atteint', 'exempt': 'seconde convocation, sans condition de quorum'}[observation.facts.verdict] }}, {{ observation.facts.presentCount }} présents sur {{ observation.facts.requiredPresent }} requis.

{% endfor %}
{% if minutes.meeting.reconvenedFrom %}
Seconde convocation après la séance n° {{ minutes.meeting.reconvenedFrom.number }} du {{ minutes.meeting.reconvenedFrom.scheduledAt | datetime }}.

{% endif %}
{% for reconvocation in minutes.conduct.reconvocations %}
Seconde convocation envoyée le {{ reconvocation.sentAt | datetime }} pour le {{ reconvocation.scheduledAt | datetime }}.

{% endfor %}
{% for entry in minutes.attendance %}
- {{ entry.member.name | text }} : {{ {'present': 'Présent', 'represented': 'Représenté', 'excused': 'Excusé', 'absent': 'Absent'}[entry.status] }}{% if entry.proxyHolder %}, pouvoir à {{ entry.proxyHolder.name | text }}{% endif %}
{% endfor %}

{% if minutes.conduct.auxiliaryAttendances %}
Assistaient également :

{% for entry in minutes.conduct.auxiliaryAttendances %}
- {{ entry.name | text }}{% if entry.quality %} ({{ entry.quality | text }}){% endif %}
{% endfor %}

{% endif %}
{% if minutes.conduct.officerChanges %}
Passations en séance :

{% for change in minutes.conduct.officerChanges %}
- {{ change.observedAt | datetime }}, {{ {'chair': 'présidence confiée', 'secretary': 'secrétariat confié'}[change.office] }} à {{ change.memberName | text }} ({{ {'mayor': 'reprise par le maire', 'deputyInNominationOrder': 'adjoint dans l’ordre des nominations', 'councilDesignation': 'désignation par le conseil', 'councilNomination': 'nomination par le conseil'}[change.basis] }}).
{% endfor %}

{% endif %}
{% if minutes.conduct.closedSessions %}
Huis clos :

{% for session in minutes.conduct.closedSessions %}
- {{ session.observedAt | datetime }}, huis clos décidé sans débat sur demande de {% for requester in session.requesters %}{{ requester.name | text }}{% if not loop.last %}, {% endif %}{% endfor %}, par {{ session.approvals }} voix sur {{ session.presentOrRepresented }} membres présents ou représentés, {% if session.wholeMeeting %}pour la suite de la séance{% else %}pour les points {% for point in minutes.points if point.id in session.agendaItemIds %}{{ point.number }}{% if not loop.last %}, {% endif %}{% endfor %}{% endif %}.
{% endfor %}

{% endif %}`;

export const jinjaMinutesProceedings = `{% for point in minutes.points %}
### {{ point.number }}. {{ point.title | text }}

{% if point.introducedAt %}
Question ajoutée en séance le {{ point.introducedAt | datetime }}.

{% endif %}
{% if point.closedSession %}
Point examiné à huis clos.

{% endif %}
{% if point.adjournedAt %}
Ajourné.

{% elif not point.completedAt %}
Non examiné.

{% endif %}
{% if point.subjectText %}
#### Sujet présenté

{{ point.subjectText | markdown }}

{% endif %}
{% if point.narrative %}
#### Discussion

{{ point.narrative | markdown }}

{% endif %}
{% for observation in point.quorumObservations if observation.facts.verdict != 'met' %}
Quorum constaté le {{ observation.observedAt | datetime }} : {{ observation.facts.presentCount }} présents sur {{ observation.facts.denominator }} membres pris en compte, seuil {{ observation.facts.requiredPresent }} : {{ 'non atteint' if observation.facts.verdict == 'notMet' else 'seconde convocation, dispense de quorum' }}.

{% endfor %}
{% if point.recusals %}
#### Déports déclarés

{% for recusal in point.recusals %}
- {{ recusal.memberName | text }} : {{ 'Intérêt personnel' if recusal.legalBasis == 'personalInterest' else 'Représentant désigné, régime L1111-6 II' }}, déport déclaré le {{ recusal.declaredAt | datetime }}.
{% endfor %}

{% endif %}
{% if point.ballot %}
{% if point.kind == 'minutesApproval' %}
{% set outcome = 'Arrêté' if point.ballot.completedAt and point.ballot.result == 'approve' else 'Non arrêté' %}
{% elif point.ballot.completedAt and point.ballot.result %}
{% set outcome = {'approve': 'Adopté', 'reject': 'Rejeté'}[point.ballot.result] %}
{% else %}
{% set outcome = 'Sans décision' %}
{% endif %}
> **Scrutin {{ 'public' if point.ballot.mode == 'public' else 'secret' }} : {{ outcome }}**
>
> Pour : {{ point.ballot.totals.approve }} · Contre : {{ point.ballot.totals.reject }} · Abstentions : {{ point.ballot.totals.abstain }}{% if point.ballot.mode == 'secret' %} · Blancs : {{ point.ballot.totals.blank }} · Nuls : {{ point.ballot.totals.invalid }}{% endif %} · Non-participations : {{ point.ballot.totals.nonParticipation }}

{% elif point.kind == 'minutesApproval' %}
Non arrêté.

{% endif %}
{% endfor %}`;

interface SignatoryLines {
  /** Office or quality of the signatory, written as is. */
  quality: string;
  /** Jinja expression rendering the name line; an empty value leaves the line blank. */
  name: string;
}

/**
 * Administrative signature block written in HTML within the Markdown body: the "Fait à" line,
 * then one or two signatories, each with a quality, a name and a blank space for the handwritten
 * signature. Layout belongs to the stylesheet (`.hall-signatures`): a single signatory occupies the
 * right half of the page, two signatories stand side by side. Without place and date, the line offers
 * two blank zones to fill in by hand (`.hall-fill`).
 */
export function jinjaSignatureBlock(
  place: string | null,
  date: string | null,
  signatories: readonly SignatoryLines[],
): string {
  const blocks = signatories
    .map((signatory) => `<div class="hall-signature">\n\n${signatory.quality}\n\n${signatory.name}\n\n</div>`)
    .join("\n");
  const handwritten = place === null || date === null;
  const line = `Fait à ${place ?? '<span class="hall-fill hall-fill-place"></span>'}, le ${date ?? '<span class="hall-fill hall-fill-date"></span>'}`;
  return `<div class="hall-signatures${handwritten ? " hall-signatures-handwritten" : ""}">\n\n${line}\n\n<div class="hall-signatories">\n${blocks}\n</div>\n</div>\n`;
}

const qualities =
  "{% set qualities = {'mayor': 'maire', 'deputyMayor': 'adjoint au maire', 'councillor': 'membre du conseil municipal'} %}";
const hallPlace = "{{ (hall.name or '……') | text }}";
const blank = "……";

// @implements-requirement HALL-FR-MIN-280
/**
 * Closing signature block of the minutes: the meeting chair and the meeting secretary.
 * Hall has no gender data: the blocks name the offices ("Présidence de séance",
 * "Secrétariat de séance") and the mandate role, so the wording does not depend on gender.
 */
export const jinjaMinutesSignatures = `${qualities}
{% set chair = minutes.signatories.chair %}
{% set secretary = minutes.signatories.secretary %}
${jinjaSignatureBlock(hallPlace, "{{ minutes.meeting.startedAt | date }}", [
  {
    quality: "Présidence de séance",
    name: "{{ (chair.name if chair else '') | text }}{% if chair and chair.role %}, {{ qualities[chair.role] }}{% endif %}",
  },
  {
    quality: "Secrétariat de séance",
    name: "{{ (secretary.name if secretary else '') | text }}{% if secretary and secretary.role %}, {{ qualities[secretary.role] }}{% endif %}",
  },
])}`;

// @implements-requirement HALL-FR-NOT-080
// @implements-requirement HALL-FR-MIN-270
/** Signature block of the mayor in office when the document is rendered, dated by the given Jinja expression. */
export const jinjaMayorSignature = (date: string): string =>
  jinjaSignatureBlock(hallPlace, date, [{ quality: "Le maire", name: "{{ (mayor.name if mayor else '') | text }}" }]);

export const jinjaMeetingNoticeBody = `{{ notice.hall.name | text }}

# Convocation au conseil municipal

{% if notice.issuedOn %}
Date de convocation : {{ notice.issuedOn | date }}

{% endif %}
Le maire convoque les membres du conseil municipal à la séance n° {{ notice.meeting.number }}, qui se tiendra le **{{ notice.meeting.scheduledAt | datetime('full') }}**.

Lieu : **{{ notice.meeting.location | text }}**.

## Ordre du jour

{% for point in notice.meeting.agenda %}
{{ point.agendaNumber }}. {{ ('Arrêt du procès-verbal de la séance précédente' if point.kind == 'minutesApproval' else point.title) | text }}
{% endfor %}
`;

export const jinjaMeetingNotice = `${jinjaMeetingNoticeBody}
${jinjaMayorSignature(`{{ notice.issuedOn | date if notice.issuedOn else '${blank}' }}`)}`;

export const jinjaDeliberationList = `{{ hall.name | text }}

# Liste des délibérations examinées

Séance du conseil municipal n° {{ minutes.meeting.number }} du {{ minutes.meeting.startedAt | date('full') }}

| N° | Point examiné | Sort |
| --- | --- | --- |
{% for entry in deliberations -%}
| {{ entry.agendaNumber }} | {{ entry.title | text }} | {{ {'adopted': 'Adoptée', 'rejected': 'Rejetée', 'withoutVote': 'Sans vote'}[entry.outcome] }} |
{% endfor %}

${jinjaMayorSignature("{{ minutes.meeting.startedAt | date }}")}`;

export const jinjaDecisionFacts = `{% set facts = decision.facts %}
{% set attendance = facts.opening.attendance if facts.opening else facts.attendance %}
{% set quorum = facts.opening.quorum if facts.opening else facts.quorum %}
# Commune {{ ('de ' ~ facts.hall.name if facts.hall else 'non renseignée') | text }}

# Extrait du registre des délibérations du conseil municipal

## Séance du {{ facts.meeting.startedAt | date }}

| Effectif | Nombre |
| --- | ---: |
| Membres en exercice | {{ quorum.memberCount }} |
| Présents {{ 'à l’ouverture' if facts.opening else 'au scrutin' }} | {{ attendance | selectattr('status', 'equalto', 'present') | list | length }} |
| Votants au scrutin | {{ decision.totals.approve + decision.totals.reject + decision.totals.abstain + decision.totals.blank + decision.totals.invalid }} |

Date de convocation : {{ facts.noticeDate | date if facts.noticeDate else 'Non renseignée' }}  
Date d’affichage : {{ decision.documentDate | date if decision.documentDate else 'Non renseignée' }}

Le {{ facts.meeting.startedAt | datetime }}, le conseil municipal s’est réuni {{ ('à ' ~ facts.meeting.location if facts.meeting.location else 'en un lieu non renseigné') | text }}, sous la présidence de {{ (facts.meeting.chair.name if facts.meeting.chair else 'une présidence non renseignée') | text }}{% if facts.meeting.chairRole %}, {{ {'mayor': 'maire', 'deputyMayor': 'adjoint au maire', 'councillor': 'membre du conseil municipal'}[facts.meeting.chairRole] }}{% endif %}.

{% if facts.opening %}
{{ {'met': 'Le quorum a été constaté à l’ouverture.', 'notMet': 'Le quorum n’était pas atteint à l’ouverture.', 'exempt': 'L’ouverture relève du régime de seconde convocation.'}[facts.opening.quorum.verdict] }}

{% endif %}
{% for status, label in [('present','Présents'),('represented','Absents avec pouvoir'),('excused','Absents excusés'),('absent','Absents')] %}
**{{ label }} :** {% for entry in attendance if entry.status == status %}{{ entry.member.name | text }}{% if entry.proxyHolder %} (pouvoir à {{ entry.proxyHolder.name | text }}){% endif %}{% if not loop.last %}, {% endif %}{% else %}Néant{% endfor %}

{% endfor %}
**Secrétaire de séance :** {{ (facts.meeting.secretary.name if facts.meeting.secretary else 'Non renseigné') | text }}

{% if facts.recusals %}
**Déports pour cette délibération :** {% for entry in facts.recusals %}{{ entry.member.name | text }}{% if not loop.last %}, {% endif %}{% endfor %}

{% endif %}`;

export const jinjaDecisionContent = `{% if decision.number %}
Délibération n° {{ decision.number | text }}

{% endif %}
## Objet : {{ decision.title | text }}

{{ decision.content | markdown }}
`;

// @implements-requirement HALL-FR-DEC-080
export const jinjaDecisionResult = `**{{ 'Adoptée' if decision.facts.ballot.result == 'approve' else 'Rejetée' }}** · Scrutin {{ 'public' if decision.facts.ballot.mode == 'public' else 'secret' }}

Pour : {{ decision.totals.approve }} · Contre : {{ decision.totals.reject }} · Abstentions : {{ decision.totals.abstain }}{% if decision.facts.ballot.mode == 'secret' %} · Blancs : {{ decision.totals.blank }} · Nuls : {{ decision.totals.invalid }}{% endif %} · Non-participations : {{ decision.totals.nonParticipation }}

${jinjaSignatureBlock(
  "{{ ((decision.facts.hall.name if decision.facts.hall else hall.name) or '……') | text }}",
  "{{ decision.facts.meeting.startedAt | date }}",
  [
    {
      quality: "Le maire",
      name: "{{ (decision.facts.meeting.chair.name if decision.facts.meeting.chairRole == 'mayor' and decision.facts.meeting.chair else '') | text }}",
    },
    {
      quality: "Secrétariat de séance",
      name: "{{ (decision.facts.meeting.secretary.name if decision.facts.meeting.secretary else '') | text }}",
    },
  ],
)}`;

// @implements-requirement HALL-FR-ATT-170
/** Attendance sheet signed by the members present on arrival: every member in council table order, with a signature column. */
export const jinjaAttendanceSheet = `{% set sheet = attendanceSheet %}
{{ hall.name | text }}

# Feuille d’émargement

Séance du conseil municipal n° {{ sheet.meeting.number }}{% if sheet.meeting.startsAt %} du {{ sheet.meeting.startsAt | datetime('full') }}{% endif %}  
Lieu : {{ (sheet.meeting.location or 'Non renseigné') | text }}

| Nom et prénom | Signature |
| --- | --- |
{% for entry in sheet.members -%}
| {{ entry.name | text }} |   |
{% endfor %}
`;

// @implements-requirement HALL-FR-ATT-180
/** Proxy form (CGCT L2121-20): a form to sign, it records nothing in Hall. */
export const jinjaProxyForm = `${qualities}
{% set grantor = proxy.grantor %}
{% set holder = proxy.holder %}
{% set commune = hall.name or '……' %}
{{ hall.name | text }}

# Pouvoir

Séance du conseil municipal du {{ proxy.meeting.startsAt | date }}

Je soussigné(e) **{{ grantor.name | text }}**, {{ qualities[grantor.role] }} de la commune {{ 'd’' if commune[:1] in 'AEIOUYÉÈÊÂÎÔaeiouyéèêâîô' else 'de ' }}{{ commune | text }}, donne pouvoir à **{{ holder.name | text }}**, {{ qualities[holder.role] }}, pour me représenter et prendre part en mon nom à tous les votes lors de la séance du conseil municipal du {{ proxy.meeting.startsAt | date }}.

Rappel (article L2121-20 du code général des collectivités territoriales) :

- un conseiller municipal ne peut être porteur que d’un seul pouvoir ;
- le pouvoir est toujours révocable ;
- sauf cas de maladie dûment constatée ou de congé de maternité, il ne peut être valable pour plus de trois séances consécutives.

${jinjaSignatureBlock(null, null, [{ quality: "Le mandant", name: "{{ grantor.name | text }}" }])}`;

export const jinjaDocumentBodies: Readonly<Record<string, string>> = {
  "document-print": "{{ generated.bodyMarkdown | markdown }}",
  "meeting-dossier-cover": `# Dossier de séance

{{ hall.name | text }}

Conseil municipal n° {{ dossier.meeting.number }}, {{ dossier.meeting.scheduledAt | datetime('full') }}, {{ dossier.meeting.location | text }}.

## Ordre du jour

{% for point in dossier.meeting.agenda %}
{{ point.agendaNumber }}. {{ ('Arrêt du procès-verbal de la séance précédente' if point.kind == 'minutesApproval' else point.title) | text }}
{% endfor %}
`,
  "meeting-dossier-point": `## Point {{ dossier.point.number }} : {{ dossier.point.title | text }}

{% if dossier.point.report %}
### Rapport

{{ dossier.point.report | markdown }}

{% endif %}
{% if dossier.point.subjectText %}
### {{ 'Projet de délibération' if dossier.point.kind == 'councilDecisionProposal' else 'Question' }}

{{ dossier.point.subjectText | markdown }}

{% endif %}
{% if dossier.point.pieces %}
### Pièces

{% for piece in dossier.point.pieces %}
- {{ piece.name | text }} ({{ 'jointe à la suite' if piece.attached else 'consultable dans Hall' }})
{% endfor %}

{% endif %}`,
  "event-invitation": `# {{ event.name | text }}

{% if event.method == 'cancel' %}
Cet événement est annulé.

{% endif %}
{% if event.schedule.kind == 'allDay' %}
Du {{ event.schedule.start | date }} (inclus) au {{ event.schedule.end | date }} (exclu), toute la journée.
{% else %}
Du {{ event.schedule.start | datetime }} au {{ event.schedule.end | datetime }}.
{% endif %}

{% if event.location %}
Lieu : {{ event.location | text }}

{% endif %}
{% if event.content %}
{{ event.content | markdown }}

{% endif %}`,
  "meeting-notice": jinjaMeetingNotice,
  "meeting-notice-message": `${jinjaMeetingNoticeBody}
Le maire{% if mayor %}  
{{ mayor.name | text }}{% endif %}

Le PDF de la convocation est joint à ce message.
`,
  minutes: `# Procès-verbal du conseil\n\n## Séance, présences et pouvoirs\n\n${jinjaMinutesFacts}\n\n## Examen des points\n\n${jinjaMinutesProceedings}\n\n${jinjaMinutesSignatures}`,
  "deliberation-list": jinjaDeliberationList,
  "council-decision": [jinjaDecisionFacts, jinjaDecisionContent, jinjaDecisionResult].join("\n\n"),
  "attendance-sheet": jinjaAttendanceSheet,
  "proxy-form": jinjaProxyForm,
};

export const jinjaBody = (type: string): string => `{# hall:jinja #}\n${jinjaDocumentBodies[type] ?? ""}`;
