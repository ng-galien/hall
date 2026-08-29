import { isImageAlignment, isImageDirective, isImageWidth, isReferenceKind } from "@hall/templating";
import type { Root } from "mdast";
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { ResourceImageFigure } from "./editor/images";
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
  "figure",
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

/** Renders contract reference directives as badges; other directives are dropped from the output. */
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
    visit(tree, "leafDirective", (node) => {
      if (!isImageDirective(node.name)) return;
      const id = node.attributes?.id;
      const align = node.attributes?.align;
      const width = node.attributes?.width;
      const alt = node.children
        .flatMap((child) => (child.type === "text" ? [child.value] : []))
        .join("")
        .trim();
      if (!id || !alt || typeof align !== "string" || typeof width !== "string") return;
      if (!isImageAlignment(align) || !isImageWidth(width)) return;
      node.data = {
        hName: "figure",
        hProperties: {
          "data-resource-image": id,
          "data-image-alt": alt,
          "data-image-align": align,
          "data-image-width": Number(width),
        },
      };
    });
  };
}

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

function ImageFigure({ node, ...props }: ComponentProps<"figure"> & { node?: unknown }) {
  const raw = props as Record<string, unknown>;
  const id = raw["data-resource-image"];
  const alt = raw["data-image-alt"];
  const align = raw["data-image-align"];
  const width = raw["data-image-width"];
  if (
    typeof id === "string" &&
    typeof alt === "string" &&
    typeof align === "string" &&
    isImageAlignment(align) &&
    isImageWidth(String(width))
  ) {
    return <ResourceImageFigure id={id} alt={alt} align={align} width={Number(width)} />;
  }
  return null;
}

export function MarkdownView({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={className ? `markdown-content ${className}` : "markdown-content"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDirective, remarkReferences]}
        rehypePlugins={[rehypeRaw]}
        allowedElements={allowedElements}
        unwrapDisallowed
        components={{ span: ReferenceSpan, figure: ImageFigure }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
