import type { Root } from "mdast";

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName?: string };
};

function text(value: string): MarkdownNode {
  return { type: "text", value };
}

function underline(children: MarkdownNode[]): MarkdownNode {
  return { type: "underline", children, data: { hName: "u" } };
}

/** Renders Tiptap's `++text++` underline syntax through the shared Markdown pipeline. */
export function remarkUnderline() {
  return (tree: Root) => {
    const transform = (node: MarkdownNode) => {
      if (!node.children) return;
      for (const child of node.children) transform(child);

      const result: MarkdownNode[] = [];
      let underlined: MarkdownNode[] | null = null;
      let changed = false;
      const append = (child: MarkdownNode) => (underlined ?? result).push(child);

      for (const child of node.children) {
        if (child.type !== "text" || typeof child.value !== "string" || !child.value.includes("++")) {
          append(child);
          continue;
        }

        let offset = 0;
        while (offset < child.value.length) {
          const delimiter = child.value.indexOf("++", offset);
          if (delimiter < 0) {
            if (offset < child.value.length) append(text(child.value.slice(offset)));
            break;
          }
          if (delimiter > offset) append(text(child.value.slice(offset, delimiter)));
          if (underlined === null) {
            underlined = [];
          } else if (underlined.length > 0) {
            result.push(underline(underlined));
            underlined = null;
            changed = true;
          } else {
            result.push(text("++++"));
            underlined = null;
          }
          offset = delimiter + 2;
        }
      }

      if (underlined !== null) result.push(text("++"), ...underlined);
      if (changed) node.children = result;
    };

    transform(tree as MarkdownNode);
  };
}
