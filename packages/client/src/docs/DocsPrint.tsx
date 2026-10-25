import { MDXProvider } from "@mdx-js/react";
import { type AnchorHTMLAttributes, useLayoutEffect } from "react";
import { mdxComponents } from "./DocsArea";
import { pageSequence } from "./pages";
import "./docs-print.css";

/* Every French page in reading order, after a title page and a table of contents: the view that
   `npm run build:docs:pdf` prints to PDF from the standalone site (`#/docs-print`). */

const anchorOf = (path: string) => `doc-${path ? path.replaceAll("/", "-") : "accueil"}`;

function PrintLink({ href = "", children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (href.startsWith("/docs")) {
    const [path = ""] = href.slice("/docs".length).replace(/^\/+/, "").split("#");
    return (
      <a href={`#${anchorOf(path.replace(/\/+$/, ""))}`} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

const printComponents = { ...mdxComponents, a: PrintLink, PageCards: () => null };

export function DocsPrint() {
  const pages = pageSequence("fr");
  const [home] = pages;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("docs-print-root");
    root.dataset.docsPrintReady = "true";
    return () => {
      root.classList.remove("docs-print-root");
      delete root.dataset.docsPrintReady;
    };
  }, []);

  return (
    <div className="docs-print docs-article">
      <section className="docs-print-cover">
        <p className="docs-print-brand">MAIRIE</p>
        <p className="docs-print-cover-title">{home?.title}</p>
        <p className="docs-print-cover-summary">{home?.summary}</p>
      </section>
      <nav className="docs-print-toc docs-article-inner">
        <h1>Sommaire</h1>
        <ol>
          {pages.map((page) => (
            <li key={page.path} data-depth={page.path ? page.path.split("/").length : 0}>
              <a href={`#${anchorOf(page.path)}`}>{page.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      {pages.map((page) => (
        <article key={page.path} id={anchorOf(page.path)} className="docs-print-page docs-article-inner">
          <header className="docs-page-head">
            <h1>{page.title}</h1>
            {page.summary ? <p className="docs-page-summary">{page.summary}</p> : null}
          </header>
          <MDXProvider components={printComponents}>
            <page.Content />
          </MDXProvider>
        </article>
      ))}
    </div>
  );
}
