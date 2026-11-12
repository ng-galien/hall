import { MDXProvider } from "@mdx-js/react";
import {
  type AnchorHTMLAttributes,
  type ComponentProps,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ListRow, ListRows } from "@/components/ui/list-row";
import { SearchInput } from "@/components/ui/search-input";
import {
  BackIcon,
  ChevronRightIcon,
  DocsIcon,
  ForwardIcon,
  OpenIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
  TranslateIcon,
} from "../components/icons";
import type { Locale } from "../i18n/I18nProvider";
import { useI18n } from "../i18n/I18nProvider";
import { usePhoneLayout } from "../shell/usePhoneLayout";
import { Callout, Compare, Details, Figure, Legend, PageCards, Step, Steps } from "./blocks";
import { type DocsNode, type DocsPage, findPage, pageSequence, pageTree, searchPages } from "./pages";
import { DocsPdfExport } from "./pdf";
import { standalone } from "./standalone";

/* The documentation area: contents tree, article, "on this page". Pages are MDX under `content/`;
   the URL is `/docs/<path>` whatever the locale (the locale only chooses the translation). On a phone the contents
   tree takes the screen in place of the page: it opens on demand and closes with each page. */

// biome-ignore-start lint/correctness/useExhaustiveDependencies: the contents tree closes whenever another page opens.
export function DocsArea() {
  const { t, locale } = useI18n();
  const params = useParams();
  const phone = usePhoneLayout();
  const [navOpen, setNavOpen] = useState(!phone);
  const path = (params["*"] ?? "").replace(/\/+$/, "");
  useEffect(() => {
    if (phone) setNavOpen(false);
  }, [phone, path]);
  const found = findPage(path, locale);
  const sequence = useMemo(() => pageSequence(locale), [locale]);
  const index = found ? sequence.findIndex((page) => page.path === found.page.path) : -1;
  const previous = index > 0 ? sequence[index - 1] : undefined;
  const next = index >= 0 ? sequence[index + 1] : undefined;
  const article = useRef<HTMLElement>(null);
  const location = useLocation();

  useLayoutEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    else article.current?.scrollTo({ top: 0 });
  }, [location]);

  return (
    <div className="docs-area">
      {navOpen ? <ContentsTree locale={locale} current={path} /> : null}
      <div className="docs-main">
        <div className="docs-toolbar">
          <Button
            variant="plain"
            size="icon"
            type="button"
            data-testid="docs-navigation-toggle"
            aria-expanded={navOpen}
            aria-label={navOpen ? t("docs.nav.collapse") : t("docs.nav.expand")}
            onClick={() => setNavOpen((value) => !value)}
          >
            {navOpen ? <SidebarCollapseIcon aria-hidden="true" /> : <SidebarExpandIcon aria-hidden="true" />}
          </Button>
          <DocsBreadcrumb path={path} locale={locale} />
          {standalone ? null : <DocsPdfExport className="docs-pdf-link" />}
          <DocsSearch locale={locale} />
        </div>
        <div className="docs-body">
          <article ref={article} className="docs-article" data-testid="docs-article">
            {found ? (
              <div className="docs-article-inner">
                <PageHead page={found.page} fallback={found.fallback} />
                <MDXProvider components={mdxComponents}>
                  <found.page.Content />
                </MDXProvider>
                <footer className="docs-pager">
                  {previous ? (
                    <Link to={`/docs/${previous.path}`} className="docs-pager-link">
                      <BackIcon aria-hidden="true" />
                      <span>
                        <span className="docs-pager-label">{t("docs.nav.previous")}</span>
                        <span className="docs-pager-title">{previous.title}</span>
                      </span>
                    </Link>
                  ) : (
                    <span />
                  )}
                  {next ? (
                    <Link to={`/docs/${next.path}`} className="docs-pager-link docs-pager-next">
                      <span>
                        <span className="docs-pager-label">{t("docs.nav.next")}</span>
                        <span className="docs-pager-title">{next.title}</span>
                      </span>
                      <ForwardIcon aria-hidden="true" />
                    </Link>
                  ) : (
                    <span />
                  )}
                </footer>
              </div>
            ) : (
              <div className="docs-not-found">
                <DocsIcon aria-hidden="true" />
                <p>{t("docs.page.notFound")}</p>
                <Link to="/docs">{t("docs.page.backHome")}</Link>
              </div>
            )}
          </article>
          {found ? <OnThisPage key={found.page.path + found.page.locale} container={article} /> : null}
        </div>
      </div>
    </div>
  );
}
// biome-ignore-end lint/correctness/useExhaustiveDependencies: the contents tree closes whenever another page opens.

function DocsBreadcrumb({ path, locale }: { path: string; locale: Locale }) {
  const { t } = useI18n();
  const parts = path ? path.split("/") : [];
  const crumbs: Array<{ label: string; to: string }> = [];
  parts.forEach((_part, index) => {
    const partial = parts.slice(0, index + 1).join("/");
    const page = findPage(partial, locale)?.page;
    if (page) crumbs.push({ label: page.title, to: `/docs/${partial}` });
  });
  return (
    <nav aria-label={t("common.breadcrumb")} className="docs-crumbs">
      <Link to="/docs">{t("docs.title")}</Link>
      {crumbs.map((crumb) => (
        <span key={crumb.to} className="docs-crumb">
          <ChevronRightIcon aria-hidden="true" />
          <Link to={crumb.to}>{crumb.label}</Link>
        </span>
      ))}
    </nav>
  );
}

function PageHead({ page, fallback }: { page: DocsPage; fallback: boolean }) {
  const { t } = useI18n();
  return (
    <header className="docs-page-head">
      <h1>{page.title}</h1>
      {page.summary ? <p className="docs-page-summary">{page.summary}</p> : null}
      <div className="docs-page-marks">
        {page.screen && !standalone ? (
          <Button asChild variant="secondary">
            <Link to={page.screen}>
              <OpenIcon aria-hidden="true" /> {t("docs.page.openScreen")}
            </Link>
          </Button>
        ) : null}
        {fallback ? (
          <span className="docs-fallback">
            <TranslateIcon aria-hidden="true" /> {t("docs.page.fallback")}
          </span>
        ) : null}
        {page.draft ? (
          <span className="record-state" data-tone="neutral">
            {t("docs.page.draft")}
          </span>
        ) : null}
      </div>
    </header>
  );
}

function ContentsTree({ locale, current }: { locale: Locale; current: string }) {
  const { t } = useI18n();
  const tree = useMemo(() => pageTree(locale), [locale]);
  return (
    <nav aria-label={t("docs.nav.label")} className="docs-tree" data-testid="docs-navigation">
      <NavLink to="/docs" end className={({ isActive }) => (isActive ? "docs-tree-home is-active" : "docs-tree-home")}>
        <DocsIcon aria-hidden="true" /> {t("docs.nav.home")}
      </NavLink>
      <div className="docs-tree-nodes">
        {tree.map((node) => (
          <TreeNode key={node.page.path} node={node} current={current} depth={0} />
        ))}
      </div>
    </nav>
  );
}

function TreeNode({ node, current, depth }: { node: DocsNode; current: string; depth: number }) {
  const { t } = useI18n();
  const inBranch = current === node.page.path || current.startsWith(`${node.page.path}/`);
  const [open, setOpen] = useState(inBranch);
  useEffect(() => {
    if (inBranch) setOpen(true);
  }, [inBranch]);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        className="docs-tree-row"
        data-current={current === node.page.path || undefined}
        style={{ paddingLeft: depth * 12 }}
      >
        {hasChildren ? (
          <Button
            variant="plain"
            size="icon"
            type="button"
            aria-expanded={open}
            aria-label={node.page.title}
            onClick={() => setOpen((value) => !value)}
            className="docs-tree-caret"
          >
            <ChevronRightIcon aria-hidden="true" data-open={open || undefined} />
          </Button>
        ) : (
          <span className="docs-tree-caret-space" />
        )}
        <NavLink
          to={`/docs/${node.page.path}`}
          end
          className="docs-tree-link"
          data-depth={depth}
          data-testid={`docs-page-${node.page.path.replaceAll("/", "-")}`}
        >
          <span className="docs-tree-title">{node.page.title}</span>
          {node.page.draft ? <span className="docs-tree-draft" title={t("docs.page.draft")} /> : null}
        </NavLink>
      </div>
      {open && hasChildren ? (
        <div className="docs-tree-nodes">
          {node.children.map((child) => (
            <TreeNode key={child.page.path} node={child} current={current} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OnThisPage({ container }: { container: { current: HTMLElement | null } }) {
  const { t } = useI18n();
  const [headings, setHeadings] = useState<Array<{ id: string; text: string; level: number }>>([]);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLHeadingElement>("h2[id], h3[id]"));
    setHeadings(
      nodes.map((node) => ({
        id: node.id,
        text: Array.from(node.childNodes)
          .filter((child) => !(child instanceof HTMLAnchorElement))
          .map((child) => child.textContent ?? "")
          .join(""),
        level: node.tagName === "H2" ? 2 : 3,
      })),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive((visible[0].target as HTMLElement).id);
      },
      { root, rootMargin: "0px 0px -70% 0px" },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [container]);

  if (headings.length < 2) return <aside className="docs-toc docs-toc-empty" />;
  return (
    <aside className="docs-toc" aria-label={t("docs.nav.toc")}>
      <div className="docs-toc-heading">{t("docs.nav.toc")}</div>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} data-level={heading.level}>
            <a href={`#${heading.id}`} data-active={active === heading.id || undefined}>
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function DocsSearch({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchPages(query, locale), [query, locale]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);
  const go = (page: DocsPage) => {
    navigate(`/docs/${page.path}`);
    setOpen(false);
    setQuery("");
  };
  return (
    <div ref={root} className="docs-search">
      <SearchInput
        data-testid="docs-search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && results[0]) go(results[0].page);
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder={t("docs.search.placeholder")}
        aria-label={t("docs.search.label")}
      />
      {open && query.trim() ? (
        <div className="docs-search-results">
          {results.length === 0 ? <p className="docs-search-empty">{t("docs.search.noResult")}</p> : null}
          <ListRows>
            {results.map(({ page, excerpt }) => (
              <ListRow
                key={page.path}
                onOpen={() => go(page)}
                openTestId={`docs-search-result-${page.path.replaceAll("/", "-")}`}
                title={page.title}
                detail={excerpt}
              />
            ))}
          </ListRows>
        </div>
      ) : null}
    </div>
  );
}

/* MDX element mapping. */

function heading(level: 2 | 3 | 4) {
  const Tag = `h${level}` as const;
  return function Heading({ id, children, ...rest }: ComponentProps<"h2">) {
    const { t } = useI18n();
    return (
      <Tag id={id} {...rest} className="docs-heading">
        {children}
        {id ? (
          <a href={`#${id}`} className="docs-anchor" aria-label={t("docs.page.sectionLink")}>
            #
          </a>
        ) : null}
      </Tag>
    );
  };
}

function MdxLink({ href = "", children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const external = /^[a-z]+:/.test(href);
  if (external)
    return (
      <a href={href} target="_blank" rel="noreferrer" {...rest}>
        {children} <OpenIcon aria-hidden="true" className="docs-external-mark" />
      </a>
    );
  return (
    <Link to={href} {...rest}>
      {children}
    </Link>
  );
}

function DocumentationImage({ src, alt, ...rest }: ComponentProps<"img">) {
  const resolved = standalone && typeof src === "string" ? src.replace(/^\/app\/documentation\//, "./") : src;
  return <img src={resolved} alt={alt} {...rest} />;
}

export const mdxComponents = {
  img: DocumentationImage,
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  a: MdxLink,
  table: ({ children }: { children?: ReactNode }) => (
    <div className="docs-table-wrap">
      <table>{children}</table>
    </div>
  ),
  Callout,
  Details,
  PageCards,
  Figure,
  Legend,
  Steps,
  Step,
  Compare,
};
