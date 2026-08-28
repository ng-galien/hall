import ReactMarkdown from "react-markdown";

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
];

export function MarkdownView({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={className ? `markdown-content ${className}` : "markdown-content"}>
      <ReactMarkdown allowedElements={allowedElements} unwrapDisallowed skipHtml>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
