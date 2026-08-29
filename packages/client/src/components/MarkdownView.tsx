import { isReferenceKind } from "@hall/templating";
import type { Root } from "mdast";
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { ReferenceBadge } from "./editor/references";

const allowedElements = [
  "p",
  "em",
  "strong",
  "u",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "hr",
  "br",
  "code",
  "pre",
  "a",
  "img",
  "span",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
];

/**
 * Les références du contrat (`:member[…]{#id}`…) s'affichent en puces, comme dans l'éditeur.
 * Une directive hors contrat n'est pas rendue : remark-directive la retire du texte, ce qui
 * suit la règle du contrat — préservée à la sérialisation, non rendue.
 */
function remarkReferences() {
  return (tree: Root) => {
    visit(tree, "textDirective", (node) => {
      if (!isReferenceKind(node.name)) return;
      node.data = {
        hName: "span",
        hProperties: {
          className: ["markdown-reference", `markdown-reference-${node.name}`],
          "data-kind": node.name,
          "data-id": node.attributes?.id ?? undefined,
        },
      };
    });
  };
}

/** La même puce que dans l'éditeur : les deux vues montrent le même document. */
function ReferenceSpan({ node, children, ...props }: ComponentProps<"span"> & { node?: unknown }) {
  const raw = props as Record<string, unknown>;
  const kind = raw["data-kind"];
  if (typeof kind === "string" && isReferenceKind(kind)) {
    const id = raw["data-id"];
    return (
      <ReferenceBadge kind={kind} id={typeof id === "string" ? id : null}>
        {children}
      </ReferenceBadge>
    );
  }
  return <span {...props}>{children}</span>;
}

export function MarkdownView({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={className ? `markdown-content ${className}` : "markdown-content"}>
      {/* GFM : sans lui un tableau saisi dans l'éditeur s'afficherait ici en barres verticales.
          rehype-raw : une table riche (fusions, largeurs) voyage en HTML embarqué dans le
          markdown — même contrat que le rendu serveur ; l'allowlist ci-dessus reste le filtre. */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDirective, remarkReferences]}
        rehypePlugins={[rehypeRaw]}
        allowedElements={allowedElements}
        unwrapDisallowed
        components={{ span: ReferenceSpan }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
