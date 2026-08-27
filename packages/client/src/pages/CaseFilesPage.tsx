import { Button, Field } from "@fluentui/react-components";
import { AddRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import {
  CollectionToolbar,
  EmptyState,
  Input,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  StatusBadge,
  Textarea,
  useCollectionView,
} from "../components/Ui";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useCaseFilesStore } from "../stores/caseFilesStore";

export function CaseFilesPage() {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const { caseFiles, create: createCaseFile, error } = useCaseFilesStore();
  const [createOpen, setCreateOpen] = useState(false);
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const visibleCaseFiles = caseFiles.filter((item) => matchesQuery(query, item.reference, item.title, item.summary));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await run(async () => {
      const created = await createCaseFile({
        reference: form.get("reference"),
        title: form.get("title"),
        summary: form.get("summary"),
        confidential: false,
        ownerMemberId: null,
      });
      if (created) {
        formElement.reset();
        setCreateOpen(false);
      }
      return created;
    });
  };
  return (
    <div className="page">
      <PageHeader title={t("caseFiles.title")} description={t("caseFiles.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout}>
          <Button appearance="primary" icon={<AddRegular />} onClick={() => setCreateOpen(true)}>
            {t("caseFiles.create")}
          </Button>
        </CollectionToolbar>
        <Modal open={createOpen} title={t("caseFiles.create")} onClose={() => setCreateOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <Field label={t("caseFiles.reference")} required>
              <Input name="reference" placeholder={t("caseFiles.referencePlaceholder")} required />
            </Field>
            <Field label={t("caseFiles.name")} required>
              <Input name="title" required />
            </Field>
            <Field label={t("caseFiles.summary")}>
              <Textarea name="summary" />
            </Field>
            <Button appearance="primary" type="submit" disabled={submitting}>
              {t(submitting ? "common.saving" : "common.create")}
            </Button>
          </form>
        </Modal>
        {visibleCaseFiles.length === 0 ? (
          <EmptyState>{t(caseFiles.length === 0 ? "caseFiles.empty" : "common.noSearchResults")}</EmptyState>
        ) : layout === "cards" ? (
          <div className="card-grid">
            {visibleCaseFiles.map((item) => (
              <Link className="entity-card" key={item.id} to={`/case-files/${item.id}`}>
                <span className="entity-card-eyebrow">{item.reference}</span>
                <strong>{item.title}</strong>
                <p>{item.summary || t("caseFiles.noSummary")}</p>
                <span className="entity-card-footer">
                  <StatusBadge value={item.status} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="data-list">
            {visibleCaseFiles.map((item) => (
              <Link className="data-row linked" key={item.id} to={`/case-files/${item.id}`}>
                <div>
                  <strong>
                    {item.reference} · {item.title}
                  </strong>
                  <span>{item.summary || t("caseFiles.noSummary")}</span>
                </div>
                <span className="data-row-side">
                  <StatusBadge value={item.status} />
                  <ChevronRightRegular aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
