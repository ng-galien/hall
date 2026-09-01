import {
  type CouncilMember,
  councilBusinessDecisionId,
  type MeetingAggregate,
  matchDiscriminated,
  matchLiteral,
  type VoteChoice,
} from "@hall/domain";

const attendanceLabels = {
  present: "Présent",
  represented: "Représenté",
  excused: "Excusé",
  absent: "Absent",
} as const;

const voteLabels: Record<VoteChoice, string> = {
  for: "Pour",
  against: "Contre",
  abstain: "Abstention",
  notVoting: "Ne prend pas part au vote",
};

const agendaStatusLabels = {
  scheduled: "Non examiné",
  inProgress: "Examen interrompu",
  examined: "Examiné",
  postponed: "Reporté",
  withdrawn: "Retiré",
} as const;

const cleanInline = (value: string) => value.replaceAll("\n", " ").trim();

export function renderMeetingMinutesDraft(aggregate: MeetingAggregate, members: readonly CouncilMember[]): string {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const memberName = (memberId: string | null) => {
    if (!memberId) return "Non renseigné";
    const member = memberById.get(memberId);
    return member ? `${member.firstName} ${member.lastName}` : `Membre ${memberId}`;
  };
  const lines = [
    "# Procès-verbal",
    "",
    "> Brouillon généré automatiquement à la clôture. Il doit être relu et finalisé avant son approbation.",
    "",
    `- Date et heure : ${aggregate.meeting.startsAt}`,
    `- Lieu : ${cleanInline(aggregate.meeting.location)}`,
    `- Président de séance : ${memberName(aggregate.meeting.chairMemberId)}`,
    `- Secrétaire de séance : ${memberName(aggregate.meeting.secretaryMemberId)}`,
    `- Quorum : ${aggregate.quorum.physicallyPresent} membre(s) physiquement présent(s) sur ${aggregate.quorum.activeMembers} en exercice ; ${aggregate.quorum.required} requis ; ${aggregate.quorum.reached ? "atteint" : "non atteint"}.`,
    "",
    "## Présences, absences et représentations",
    "",
  ];

  for (const attendance of aggregate.attendance) {
    const proxy = attendance.proxyHolderMemberId
      ? ` par ${memberName(attendance.proxyHolderMemberId)}${attendance.proxyDocumentId ? " (pouvoir écrit enregistré)" : ""}`
      : "";
    lines.push(`- ${memberName(attendance.memberId)} - ${attendanceLabels[attendance.status]}${proxy}`);
  }
  if (aggregate.attendance.length === 0) lines.push("- Aucune présence consignée.");

  lines.push("", "## Ordre du jour et teneur des discussions", "");
  for (const item of aggregate.agendaItems) {
    lines.push(`### ${item.position}. ${cleanInline(item.business.title)}`, "");
    lines.push(`- Issue : ${agendaStatusLabels[item.status]}`);
    if (item.business.report.trim()) lines.push("", "#### Rapport présenté", "", item.business.report.trim());
    if (item.councilDecisionSnapshot) {
      lines.push("", "#### Projet de délibération examiné", "", item.councilDecisionSnapshot.draftText.trim());
    }
    lines.push(
      "",
      "#### Discussion",
      "",
      item.discussionSummary.trim() || "Aucune synthèse de discussion n’a été consignée.",
    );

    const councilDecisionId = councilBusinessDecisionId(item.business);
    const ballot = aggregate.ballots.find(
      (candidate) =>
        !candidate.cancelledAt &&
        matchDiscriminated(candidate.target, "kind", {
          agendaItem: (target) => target.id === item.id,
          councilDecision: (target) => councilDecisionId !== null && target.id === councilDecisionId,
        }),
    );
    if (ballot) {
      const methodLabel = matchLiteral(ballot.method, {
        public: () => "scrutin public",
        secret: () => "scrutin secret",
      });
      const resultLabel = matchLiteral(ballot.result, {
        adopted: () => "adopté",
        rejected: () => "rejeté",
      });
      lines.push(
        "",
        "#### Scrutin",
        "",
        `- Modalité : ${methodLabel}`,
        `- Résultat : ${resultLabel}`,
        `- Pour : ${ballot.votesFor} ; contre : ${ballot.votesAgainst} ; abstentions : ${ballot.abstentions} ; ne prennent pas part au vote : ${ballot.notVoting}`,
      );
      matchDiscriminated(ballot, "method", {
        secret: () => undefined,
        public: (publicBallot) => {
          for (const vote of publicBallot.votes) {
            const proxy =
              vote.castByMemberId !== vote.memberId ? `, exprimé par ${memberName(vote.castByMemberId)}` : "";
            lines.push(`- ${memberName(vote.memberId)} : ${voteLabels[vote.choice]}${proxy}`);
          }
        },
      });
    }
    lines.push("");
  }
  if (aggregate.agendaItems.length === 0) lines.push("Aucun point n’était inscrit à l’ordre du jour.", "");

  return `${lines.join("\n").trim()}\n`;
}
