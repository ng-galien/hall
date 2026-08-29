import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { ChevronRightIcon } from "./icons";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("common.breadcrumb")} className="flex min-w-0 items-center gap-1 text-xs text-muted">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const content = <span className={`truncate ${last ? "font-semibold text-text" : ""}`}>{item.label}</span>;
        return (
          <Fragment key={item.to ?? item.label}>
            {index > 0 ? <ChevronRightIcon className="app-icon shrink-0 text-xs text-faint" /> : null}
            {item.to && !last ? (
              <Link to={item.to} className="hover:text-text">
                {content}
              </Link>
            ) : (
              content
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
