import type { ContentTemplate } from "@hall/domain";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddIcon } from "../components/icons";
import { EmptyState, Modal, PageHeader, RequestErrorBanner } from "../components/Ui";
import { knownTemplateTypes, templateTypeLabel } from "../features/templates/templateTypes";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { createTemplate, listTemplates } from "../services/templatesApi";

/** Modèles de documents: the template of each generated document, and the creation of a missing one. */
// @implements-requirement HALL-FR-DOC-580
export function TemplatesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { submitting, run } = useSubmitting();
  const fieldId = useId();
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

  return (
    <div className="page">
      <PageHeader title={t("templates.title")} description={t("templates.description")}>
        {canCreate ? (
          <Button data-testid="templates-add" onClick={() => setAddOpen(true)}>
            <AddIcon />
            {t("templates.add")}
          </Button>
        ) : null}
      </PageHeader>
      <div className="page-content">
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
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-type`}>{t("templates.addType")}</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger id={`${fieldId}-type`} className="w-full" data-testid="templates-add-type">
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
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-name`}>{t("templates.name")}</Label>
                <Input
                  id={`${fieldId}-name`}
                  required
                  value={newName}
                  data-testid="templates-add-name"
                  onChange={(event) => setNewName(event.currentTarget.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !newType || !newName.trim()}
                data-testid="templates-add-submit"
              >
                {t(submitting ? "common.saving" : "common.create")}
              </Button>
            </form>
          )}
        </Modal>
        {templates === null ? null : templates.length === 0 ? (
          <EmptyState>{t("templates.empty")}</EmptyState>
        ) : (
          <div className="data-list" data-testid="templates-list">
            {templates.map((template) => {
              const label = templateTypeLabel(template.documentType, template.kind);
              return (
                <Link
                  className="data-row linked"
                  key={template.id}
                  to={`/templates/${template.id}`}
                  data-testid={`template-row-${template.id}`}
                >
                  <div>
                    <strong>{template.name}</strong>
                    <span>{label ? t(label) : template.documentType}</span>
                  </div>
                  <Badge variant="outline">{t(`templates.kind.${template.kind}`)}</Badge>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
