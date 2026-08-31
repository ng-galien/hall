import mdx from "@mdx-js/rollup";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";

/* MDX pipeline of the integrated documentation (`src/docs/content`).
   Every page exports `frontmatter` (title, summary, …) and `searchText` (its plain text, for the search box). */

/** Collects the readable text of a page and exports it as `searchText`. */
function remarkSearchText() {
  return (tree) => {
    const parts = [];
    const visit = (node) => {
      if (node.type === "code" || node.type === "mdxjsEsm" || node.type === "yaml") return;
      if (node.type === "text" || node.type === "inlineCode") parts.push(node.value);
      if (node.type === "heading" || node.type === "paragraph" || node.type === "listItem" || node.type === "tableRow")
        parts.push("\n");
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
    const text = parts
      .join(" ")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
    tree.children.unshift({
      type: "mdxjsEsm",
      value: "",
      data: {
        estree: {
          type: "Program",
          sourceType: "module",
          body: [
            {
              type: "ExportNamedDeclaration",
              specifiers: [],
              declaration: {
                type: "VariableDeclaration",
                kind: "const",
                declarations: [
                  {
                    type: "VariableDeclarator",
                    id: { type: "Identifier", name: "searchText" },
                    init: { type: "Literal", value: text },
                  },
                ],
              },
            },
          ],
        },
      },
    });
  };
}

export function hallDocsMdx() {
  return {
    enforce: "pre",
    ...mdx({
      providerImportSource: "@mdx-js/react",
      remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm, remarkSearchText],
      rehypePlugins: [rehypeSlug],
    }),
  };
}
