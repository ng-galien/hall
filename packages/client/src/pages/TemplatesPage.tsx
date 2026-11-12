import type { ContentTemplate } from "@hall/domain";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TemplateIcon } from "../components/icons";
import { EmptyState, Modal, PageHeader, RequestErrorBanner } from "../components/Ui";
import { CreateButton } from "../components/ui/create-button";
import { ListRow, ListRowIcon, ListRows } from "../components/ui/list-row";
import { SectionHeader } from "../components/ui/section-header";
import { knownTemplateTypes, templateTypeLabel } from "../features/templates/templateTypes";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { createTemplate, listTemplates } from "../services/templatesApi";

/** Modèles de documents: the template of each generated document, and the creation of a missing one. */
// @implements-requirement HALL-FR-DOC-580
export function TemplatesPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { submitting, run } = useSubmitting();
  const [templates, setTemplates] = useState<ContentTemplate[] | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    void listTemplates()
      .then((listing) => {
        setTemplates(listing.templates);
        setCanCreate(listing.canCreate);
      })
      .catch((failure) => setError(apiErrorCode(failure)));
  }, []);

  const missingTypes = knownTemplateTypes.filter(
    (type) =>
      !templates?.some((template) => template.documentType === type.documentType && template.kind === type.kind),
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const type = missingTypes.find((entry) => entry.documentType === newType);
    if (!type || !newName.trim()) return;
    void run(async () => {
      try {
        const created = await createTemplate({ ...type.starter, name: newName.trim() });
        navigate(`/templates/${created.id}`);
        return true;
      } catch (failure) {
        setError(apiErrorCode(failure));
        return false;
      }
    });
  };

  const addButton = (
    <CreateButton
      testId="templates-add"
      placement={embedded ? "inline" : "screen"}
      options={
        canCreate
          ? [
              {
                id: "template",
                label: t("templates.add"),
                Icon: TemplateIcon,
                nature: "writing",
                onSelect: () => setAddOpen(true),
              },
            ]
          : []
      }
    />
  );
  return (
    <div className={embedded ? "creation-form" : "page"}>
      {embedded ? (
        <SectionHeader
          level={3}
          title={t("templates.title")}
          description={t("templates.description")}
          commands={<>{addButton}</>}
        />
      ) : (
        <PageHeader title={t("templates.title")} hint={t("templates.description")}>
          {addButton}
        </PageHeader>
      )}
      <div className={embedded ? "" : "page-content"}>
        <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
        <Modal
          open={addOpen}
          title={t("templates.add")}
          onClose={() => setAddOpen(false)}
          testId="templates-add-dialog"
        >
          {missingTypes.length === 0 ? (
            <p data-testid="templates-all-present">{t("templates.allTypesPresent")}</p>
          ) : (
            <form className="modal-form" onSubmit={submit}>
              <Field label={t("templates.addType")}>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="w-full" data-testid="templates-add-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {missingTypes.map((type) => (
                      <SelectItem
                        key={type.documentType}
                        value={type.documentType}
                        data-testid={`templates-add-type-${type.documentType}`}
                      >
                        {t(type.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("templates.name")}>
                <Input
                  required
                  value={newName}
                  data-testid="templates-add-name"
                  onChange={(event) => setNewName(event.currentTarget.value)}
                />
              </Field>
              <div className="dialog-actions">
                <Button variant="secondary" type="button" onClick={() => setAddOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || !newType || !newName.trim()}
                  data-testid="templates-add-submit"
                >
                  {t(submitting ? "common.saving" : "common.create")}
                </Button>
              </div>
            </form>
          )}
        </Modal>
        {templates === null ? null : templates.length === 0 ? (
          <EmptyState>{t("templates.empty")}</EmptyState>
        ) : (
          <ListRows data-testid="templates-list">
            {templates.map((template) => {
              const label = templateTypeLabel(template.documentType, template.kind);
              return (
                <ListRow
                  key={template.id}
                  to={`/templates/${template.id}`}
                  openTestId={`template-row-${template.id}`}
                  head={
                    <ListRowIcon nature="writing">
                      <TemplateIcon />
                    </ListRowIcon>
                  }
                  title={template.name}
                  detail={`${label ? t(label) : template.documentType} · ${t(`templates.kind.${template.kind}`)}`}
                />
              );
            })}
          </ListRows>
        )}
      </div>
    </div>
  );
}
