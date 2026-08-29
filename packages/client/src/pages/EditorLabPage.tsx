import { useEffect, useState } from "react";
import { MarkdownEditor } from "../components/editor/MarkdownEditor";
import type { Mentionable } from "../components/editor/references";
import { MarkdownView } from "../components/MarkdownView";
import { PageHeader } from "../components/Ui";
import { resourceTone, toneIcons, toneLabelKeys } from "../features/documents/ResourceGlyph";
import { useI18n } from "../i18n/I18nProvider";
import { listCouncilBusinesses } from "../services/councilBusinessApi";
import { listCouncilDecisions } from "../services/councilDecisionsApi";
import { listCouncilMeetings } from "../services/councilMeetingsApi";
import { listCouncilMembers } from "../services/councilMembersApi";
import { listResources } from "../services/resourcesApi";

/**
 * Banc d'essai de l'éditeur.
 *
 * Une page isolée pour travailler l'éditeur sans traverser l'application : ce qu'on écrit à
 * gauche, le rendu réel à droite, et le markdown produit en dessous. C'est ici qu'on juge le
 * comportement des tableaux, des liens et des styles avant de les retrouver dans les établis.
 */
const sample = [
  "## Subventions aux associations",
  "",
  "La commission a examiné les huit dossiers reçus. Cinq demandes sont retenues.",
  "",
  "Rapporteur : :member[Camille Bernard]{#demo-member}, sur pièce :resource[Bilan des subventions 2025]{#demo-piece}.",
  "",
  "| Association | Objet | Montant |",
  "| --- | --- | ---: |",
  "| Les Tilleuls | Animation seniors | 2 400 € |",
  "| Club sportif | Encadrement jeunes | 4 800 € |",
  "| Comité des fêtes | Fête communale | 3 200 € |",
  "",
  "> Le conseil se prononcera lors de la séance de septembre.",
  "",
  "- Crédits inscrits au chapitre 65",
  "- Versement en une fois après notification",
].join("\n");

export function EditorLabPage() {
  const { t } = useI18n();
  const [markdown, setMarkdown] = useState(sample);
  const [mentionables, setMentionables] = useState<Mentionable[]>([]);

  /* Le banc travaille sur les vraies données du seed. Les entités adressables par slug le
     sont par slug dans les directives ; les membres n'en ont pas et restent sur leur id. */
  useEffect(() => {
    void Promise.all([
      listCouncilMembers(),
      listResources(),
      listCouncilBusinesses(),
      listCouncilMeetings(),
      listCouncilDecisions(),
    ]).then(([members, allResources, businesses, meetings, decisions]) => {
      setMentionables([
        ...members.map((member) => ({
          kind: "member" as const,
          id: member.id,
          label: `${member.firstName} ${member.lastName}`,
        })),
        ...allResources.map((resource) => {
          const tone = resourceTone(resource);
          return {
            kind: "resource" as const,
            id: resource.slug,
            label: resource.title,
            folderPath: resource.folderPath,
            icon: toneIcons[tone],
            metaLabel: t(toneLabelKeys[tone]),
            extra: resource.kind === "document" ? [resource.fileName] : [],
          };
        }),
        ...businesses.map((business) => ({
          kind: "councilBusiness" as const,
          id: business.slug,
          label: business.title,
          folderPath: business.folderPath,
        })),
        ...meetings.map((meeting) => ({
          kind: "meeting" as const,
          id: meeting.slug,
          label: meeting.title,
          extra: [meeting.number],
        })),
        ...decisions.map((decision) => ({
          kind: "decision" as const,
          id: decision.slug,
          label: decision.title,
          extra: [decision.number],
        })),
      ]);
    });
  }, [t]);

  return (
    <div className="page">
      <PageHeader
        title="Banc d'essai de l'éditeur"
        description="Écrire à gauche, voir le rendu à droite, et lire le markdown produit."
      />
      <div className="page-content editor-lab">
        <section className="editor-lab-pane" aria-labelledby="editor-lab-write">
          <h2 id="editor-lab-write">Écriture</h2>
          <MarkdownEditor title="Banc d'essai" markdown={markdown} onChange={setMarkdown} mentionables={mentionables} />
        </section>

        <section className="editor-lab-pane" aria-labelledby="editor-lab-render">
          <h2 id="editor-lab-render">Rendu</h2>
          <div className="editor-lab-render">
            <MarkdownView markdown={markdown} />
          </div>
        </section>

        <section className="editor-lab-pane editor-lab-source" aria-labelledby="editor-lab-source">
          <h2 id="editor-lab-source">Markdown produit</h2>
          <pre>{markdown}</pre>
        </section>
      </div>
    </div>
  );
}
