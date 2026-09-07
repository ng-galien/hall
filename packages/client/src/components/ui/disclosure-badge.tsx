import { AddIcon, RuleIcon } from "../icons";

export function DisclosureBadge({ expanded }: { expanded?: boolean }) {
  return (
    <span className="disclosure-badge" data-expanded={expanded} aria-hidden="true">
      <AddIcon className="disclosure-badge-plus" />
      <RuleIcon className="disclosure-badge-minus" />
    </span>
  );
}
