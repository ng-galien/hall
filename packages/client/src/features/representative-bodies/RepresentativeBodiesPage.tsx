import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CommitteeIcon } from "../../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../../components/Ui";
import { CreateButton } from "../../components/ui/create-button";
import { ListRow, ListRowIcon, ListRows } from "../../components/ui/list-row";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { RepresentativeBodiesState } from "../../stores/representativeBodiesStore";
import type { RepresentativeBodyKind } from "./representativeBodyKinds";

/** The list of one kind of body, with its search and, when Siren offers it, the creation dialog. */
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
  const { query, setQuery } = useCollectionView();
  const BodyIcon = bodyKind.icon;

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
      <PageHeader title={t(text.title)} hint={t(text.description)} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery}>
          <CreateButton
            testId={`${bodyKind.kind}-create-open`}
            options={
              canCreate
                ? [
                    {
                      id: bodyKind.kind,
                      label: t(text.add),
                      Icon: CommitteeIcon,
                      nature: "council",
                      onSelect: () => setAddOpen(true),
                    },
                  ]
                : []
            }
          />
        </CollectionToolbar>

        <Modal open={canCreate && addOpen} title={t(text.add)} onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <Field label={t(text.name)}>
              <Input name="name" required data-testid={`${bodyKind.kind}-create-name`} />
            </Field>
            <Field label={t(text.purpose)}>
              <Textarea name="description" data-testid={`${bodyKind.kind}-create-description`} />
            </Field>
            <div className="dialog-actions">
              <Button variant="secondary" type="button" onClick={() => setAddOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting} data-testid={`${bodyKind.kind}-create-submit`}>
                {t(submitting ? "common.saving" : "common.create")}
              </Button>
            </div>
          </form>
        </Modal>

        {visibleBodies.length === 0 ? (
          <EmptyState>{t(bodies.length === 0 ? text.empty : "common.noSearchResults")}</EmptyState>
        ) : (
          <ListRows className="list-full-titles">
            {visibleBodies.map((body) => (
              <ListRow
                key={body.id}
                to={`${bodyKind.path}/${body.id}`}
                openTestId={`${bodyKind.kind}-row-${body.id}`}
                head={
                  <ListRowIcon nature="council">
                    <BodyIcon />
                  </ListRowIcon>
                }
                title={body.name}
                className="body-row"
                detail={
                  <>
                    <span className="body-row-object">{body.description || t(text.noDescription)}</span>
                    <span className="body-row-count">
                      {` · ${t("members.count", { count: String(activeMembershipCount(body.id)) })}`}
                    </span>
                  </>
                }
                status={{
                  tone: body.archivedAt ? "neutral" : "success",
                  label: t(body.archivedAt ? text.archived : text.active),
                }}
              />
            ))}
          </ListRows>
        )}
      </div>
    </div>
  );
}
