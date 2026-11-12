import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { ForwardIcon, InfoIcon, OfficialRuleIcon, TipIcon, WarningIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import { DisclosureBadge } from "../components/ui/disclosure-badge";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { findNode } from "./pages";

/* Building blocks available inside every documentation page (mapped through MDXProvider). */

const calloutIcons = { note: InfoIcon, tip: TipIcon, warning: WarningIcon, rule: OfficialRuleIcon };

/** Aside block: note, tip, warning, or a product rule (something the application guarantees or refuses). */
export function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: "note" | "tip" | "warning" | "rule";
  title?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const Icon = calloutIcons[kind];
  return (
    <aside className="docs-callout" data-kind={kind}>
      <Icon aria-hidden="true" className="docs-callout-icon" />
      <div className="docs-callout-content">
        <div className="docs-callout-title">{title ?? t(`docs.callout.${kind}` as TranslationKey)}</div>
        <div className="docs-callout-body">{children}</div>
      </div>
    </aside>
  );
}

/** Collapsible section for detail the reader does not need on first pass. */
export function Details({
  title,
  open: openByDefault = false,
  children,
}: {
  title: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(openByDefault);
  return (
    <section className="docs-details">
      <Button
        variant="plain"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="docs-details-toggle"
      >
        <DisclosureBadge expanded={open} />
        <span>{title}</span>
      </Button>
      {open ? <div className="docs-details-body">{children}</div> : null}
    </section>
  );
}

/** Cards of the sub-pages of the current (or given) page: the hub pattern, one screen then deeper. */
export function PageCards({ of }: { of?: string }) {
  const { t, locale } = useI18n();
  const node = findNode(of ?? "", locale);
  if (!node || node.children.length === 0) return null;
  return (
    <nav aria-label={t("docs.nav.inThisSection")} className="docs-cards">
      {node.children.map((child) => (
        <Link key={child.page.path} to={`/docs/${child.page.path}`} className="docs-card">
          <span className="docs-card-title">
            {child.page.title}
            {child.page.draft ? (
              <span className="record-state" data-tone="neutral">
                {t("docs.page.draft")}
              </span>
            ) : null}
            <ForwardIcon aria-hidden="true" className="docs-card-arrow" />
          </span>
          {child.page.summary ? <span className="docs-card-summary">{child.page.summary}</span> : null}
          {child.children.length ? (
            <span className="docs-card-children">
              {child.children.map((grandChild) => grandChild.page.title).join(" · ")}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** Figure with a caption; wraps an illustration, a diagram or an image. */
export function Figure({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  return (
    <figure className="docs-figure">
      <div className="docs-figure-body">{children}</div>
      {caption ? <figcaption className="docs-figure-caption">{caption}</figcaption> : null}
    </figure>
  );
}

/** Numbered legend under a screenshot or an annotated figure: ① text, ② text… */
export function Legend({ items }: { items: string[] }) {
  return (
    <ol className="docs-legend">
      {items.map((item, index) => (
        <li key={item}>
          <span className="docs-mark">{index + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** Ordered steps of a guide, each with a title and a body. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="docs-steps">{children}</ol>;
}

export function Step({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <li className="docs-step">
      <div className="docs-step-title">{title}</div>
      {children ? <div className="docs-step-body">{children}</div> : null}
    </li>
  );
}

/** Two-column comparison (préparation vs séance, brouillon vs adopté…). */
export function Compare({
  left,
  right,
  leftTitle,
  rightTitle,
}: {
  left: ReactNode;
  right: ReactNode;
  leftTitle: ReactNode;
  rightTitle: ReactNode;
}) {
  return (
    <div className="docs-compare">
      <div className="docs-compare-panel">
        <div className="docs-compare-title">{leftTitle}</div>
        <div className="docs-compare-body">{left}</div>
      </div>
      <div className="docs-compare-panel">
        <div className="docs-compare-title">{rightTitle}</div>
        <div className="docs-compare-body">{right}</div>
      </div>
    </div>
  );
}
