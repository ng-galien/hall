import { type FormEvent, useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddIcon } from "../../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { RepresentativeBodiesState } from "../../stores/representativeBodiesStore";
import type { RepresentativeBodyKind } from "./representativeBodyKinds";

/** The list of one kind of body, with its search, its two layouts and, when Siren offers it, the creation dialog. */
export function RepresentativeBodiesPage({
  bodyKind,
  useStore,
}: {
  bodyKind: RepresentativeBodyKind;
  useStore: () => RepresentativeBodiesState;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { submitting, run } = useSubmitting();
  const { bodies, details, error, canCreate, load, loadAllDetails, create } = useStore();
  const text = bodyKind.text;
  const [addOpen, setAddOpen] = useState(false);
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const fieldId = useId();

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (bodies.length > 0) void loadAllDetails();
  }, [bodies.length, loadAllDetails]);

  const visibleBodies = bodies.filter((body) => matchesQuery(query, body.name, body.description));
  const activeMembershipCount = (bodyId: string) =>
    details[bodyId]?.memberships.filter((membership) => !membership.endedOn).length ?? 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await run(async () => {
      const body = await create({ name: form.get("name"), description: form.get("description") });
      if (!body) return false;
      formElement.reset();
      setAddOpen(false);
      navigate(`${bodyKind.path}/${body.id}`);
      return true;
    });
  };

  return (
    <div className="page">
      <PageHeader title={t(text.title)} description={t(text.description)} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout}>
          {canCreate ? (
            <Button data-testid={`${bodyKind.kind}-create-open`} onClick={() => setAddOpen(true)}>
              <AddIcon />
              {t(text.add)}
            </Button>
          ) : null}
        </CollectionToolbar>

        <Modal open={canCreate && addOpen} title={t(text.add)} onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-name`}>{t(text.name)}</Label>
              <Input id={`${fieldId}-name`} name="name" required data-testid={`${bodyKind.kind}-create-name`} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-description`}>{t(text.purpose)}</Label>
              <Textarea
                id={`${fieldId}-description`}
                name="description"
                data-testid={`${bodyKind.kind}-create-description`}
              />
            </div>
            <Button type="submit" disabled={submitting} data-testid={`${bodyKind.kind}-create-submit`}>
              {t(submitting ? "common.saving" : "common.create")}
            </Button>
          </form>
        </Modal>

        {visibleBodies.length === 0 ? (
          <EmptyState>{t(bodies.length === 0 ? text.empty : "common.noSearchResults")}</EmptyState>
        ) : layout === "cards" ? (
          <div className="card-grid">
            {visibleBodies.map((body) => (
              <Link
                className="entity-card"
                key={body.id}
                to={`${bodyKind.path}/${body.id}`}
                data-testid={`${bodyKind.kind}-row-${body.id}`}
              >
                <strong>{body.name}</strong>
                <p>{body.description || t(text.noDescription)}</p>
                <span className="entity-card-footer">
                  <Badge variant="outline">
                    {t("members.count", { count: String(activeMembershipCount(body.id)) })}
                  </Badge>
                  <Badge variant={body.archivedAt ? "secondary" : "success"}>
                    {t(body.archivedAt ? text.archived : text.active)}
                  </Badge>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="data-list">
            {visibleBodies.map((body) => (
              <Link
                className="data-row linked"
                key={body.id}
                to={`${bodyKind.path}/${body.id}`}
                data-testid={`${bodyKind.kind}-row-${body.id}`}
              >
                <div>
                  <strong>{body.name}</strong>
                  <span>{body.description || t(text.noDescription)}</span>
                </div>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">
                    {t("members.count", { count: String(activeMembershipCount(body.id)) })}
                  </Badge>
                  <Badge variant={body.archivedAt ? "secondary" : "success"}>
                    {t(body.archivedAt ? text.archived : text.active)}
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
