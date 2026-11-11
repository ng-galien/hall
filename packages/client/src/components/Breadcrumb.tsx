import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { ChevronRightIcon } from "./icons";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

/** Screens above the current one, written in the first line of the screen header. */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("common.breadcrumb")} className="breadcrumb">
      {items.map((item, index) => {
        const content = <span className="truncate">{item.label}</span>;
        return (
          <Fragment key={item.to ?? item.label}>
            {index > 0 ? <ChevronRightIcon className="breadcrumb-separator" /> : null}
            {item.to ? <Link to={item.to}>{content}</Link> : content}
          </Fragment>
        );
      })}
    </nav>
  );
}
