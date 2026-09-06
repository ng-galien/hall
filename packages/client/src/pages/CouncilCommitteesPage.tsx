import { type FormEvent, useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddIcon } from "../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../components/Ui";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";

export function CouncilCommitteesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { submitting, run } = useSubmitting();
  const { committees, details, error, canCreate, load, loadAllDetails, create } = useCouncilCommitteesStore();
  const [addOpen, setAddOpen] = useState(false);
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const fieldId = useId();

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (committees.length > 0) void loadAllDetails();
  }, [committees.length, loadAllDetails]);

  const visibleCommittees = committees.filter((committee) =>
    matchesQuery(query, committee.name, committee.description),
  );
  const activeMembershipCount = (committeeId: string) =>
    details[committeeId]?.memberships.filter((membership) => !membership.endedOn).length ?? 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await run(async () => {
      const committee = await create({ name: form.get("name"), description: form.get("description") });
      if (!committee) return false;
      formElement.reset();
      setAddOpen(false);
      navigate(`/council-committees/${committee.id}`);
      return true;
    });
  };

  return (
    <div className="page">
      <PageHeader title={t("committees.title")} description={t("committees.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout}>
          {canCreate ? (
            <Button onClick={() => setAddOpen(true)}>
              <AddIcon />
              {t("committees.add")}
            </Button>
          ) : null}
        </CollectionToolbar>

        <Modal open={canCreate && addOpen} title={t("committees.add")} onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-name`}>{t("committees.name")}</Label>
              <Input id={`${fieldId}-name`} name="name" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-description`}>{t("committees.purpose")}</Label>
              <Textarea id={`${fieldId}-description`} name="description" />
            </div>
            <Button type="submit" disabled={submitting}>
              {t(submitting ? "common.saving" : "common.create")}
            </Button>
          </form>
        </Modal>

        {visibleCommittees.length === 0 ? (
          <EmptyState>{t(committees.length === 0 ? "committees.empty" : "common.noSearchResults")}</EmptyState>
        ) : layout === "cards" ? (
          <div className="card-grid">
            {visibleCommittees.map((committee) => (
              <Link className="entity-card" key={committee.id} to={`/council-committees/${committee.id}`}>
                <strong>{committee.name}</strong>
                <p>{committee.description || t("committees.noDescription")}</p>
                <span className="entity-card-footer">
                  <Badge variant="outline">
                    {t("members.count").replace("{count}", String(activeMembershipCount(committee.id)))}
                  </Badge>
                  <Badge variant={committee.archivedAt ? "secondary" : "success"}>
                    {t(committee.archivedAt ? "committees.archived" : "committees.active")}
                  </Badge>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="data-list">
            {visibleCommittees.map((committee) => (
              <Link className="data-row linked" key={committee.id} to={`/council-committees/${committee.id}`}>
                <div>
                  <strong>{committee.name}</strong>
                  <span>{committee.description || t("committees.noDescription")}</span>
                </div>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">
                    {t("members.count").replace("{count}", String(activeMembershipCount(committee.id)))}
                  </Badge>
                  <Badge variant={committee.archivedAt ? "secondary" : "success"}>
                    {t(committee.archivedAt ? "committees.archived" : "committees.active")}
                  </Badge>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
