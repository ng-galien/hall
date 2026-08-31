declare module "*.mdx" {
  import type { ComponentType } from "react";

  export const frontmatter: {
    title: string;
    summary?: string;
    order?: number;
    draft?: boolean;
    screen?: string;
  };
  export const searchText: string;
  const Content: ComponentType;
  export default Content;
}
