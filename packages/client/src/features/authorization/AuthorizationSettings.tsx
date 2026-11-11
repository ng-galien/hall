import {
  type AuthorizationCondition,
  type AuthorizationConfiguration,
  type AuthorizationRole,
  findSirenAction,
  type SirenEmbeddedEntity,
  type SirenEntity,
} from "@hall/api-contract";
import { useCallback, useEffect, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode, apiSirenRequest, submitSirenAction } from "../../services/apiClient";
import { USER_ACCESS_CHANGED_EVENT } from "../../services/usersApi";
import { authorizationLabels } from "./authorizationLabels";
import { useRoleOptionsStore } from "./useRoleOptions";

// @implements-requirement HALL-FR-USR-060
export function AuthorizationSettings() {
  const { t } = useI18n();
  const [config, setConfig] = useState<AuthorizationConfiguration | null>(null);
  const [representation, setRepresentation] = useState<SirenEntity | null>(null);
  const [draft, setDraft] = useState<AuthorizationRole | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const { submitting: busy, run } = useSubmitting();
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const load = useCallback(async (selected?: string) => {
    const result = await apiSirenRequest<AuthorizationConfiguration>("/roles");
    setConfig(result.data);
    setRepresentation(result.representation);
    setDraft(result.data.roles.find((role) => role.id === selected) ?? result.data.roles[0] ?? null);
  }, []);
  useEffect(() => {
    void load().catch((error) => setError(apiErrorCode(error)));
  }, [load]);
  const currentEntity = representation?.entities?.find(
    (entity): entity is SirenEmbeddedEntity => "properties" in entity && entity.properties?.id === draft?.id,
  );
  const canCreate = Boolean(representation && findSirenAction(representation, "role.create"));
  const canUpdate = Boolean(currentEntity && findSirenAction(currentEntity, "role.update"));
  const canDelete = Boolean(currentEntity && findSirenAction(currentEntity, "role.delete"));
  const editable = Boolean(draft && (draft.revision === 0 ? canCreate : canUpdate));
  const update = (role: AuthorizationRole) => {
    setDraft(role);
    setSaved(false);
    setError(null);
  };
  const afterChange = async (selected?: string) => {
    await load(selected);
    await useRoleOptionsStore.getState().load();
    window.dispatchEvent(new Event(USER_ACCESS_CHANGED_EVENT));
  };
  const save = () =>
    run(async () => {
      if (!draft || !representation || !editable) return;
      setError(null);
      setSaved(false);
      try {
        const source = draft.revision === 0 ? representation : currentEntity;
        if (!source) return;
        const result = await submitSirenAction<AuthorizationRole>(
          source,
          draft.revision === 0 ? "role.create" : "role.update",
          {
            name: draft.name,
            revision: draft.revision,
            grants: draft.grants.filter((grant) =>
              config?.accesses.some((access) => access.access === grant.access && access.configurable),
            ),
          },
        );
        await afterChange(result.data.id);
        setSaved(true);
      } catch (error) {
        setError(apiErrorCode(error));
      }
    });
  const remove = () =>
    run(async () => {
      if (!draft || !currentEntity || !canDelete) return;
      setError(null);
      try {
        await submitSirenAction(currentEntity, "role.delete", { revision: draft.revision });
        setDeleteOpen(false);
        await afterChange();
      } catch (error) {
        setError(apiErrorCode(error));
      }
    });
  if (!config || !draft)
    return (
      <>
        <RequestErrorBanner error={error} />
        {!error && <p>{t("common.loading")}</p>}
      </>
    );
  return (
    <section className="creation-form" data-testid="authorization-settings">
      <h3>{t("authorization.title")}</h3>
      <p className="admin-hint">{t("authorization.description")}</p>
      {!deleteOpen && <RequestErrorBanner error={error} />}
      <div className="authorization-role-picker">
        <Field label={t("authorization.role")}>
          <Select
            value={draft.revision === 0 ? "new" : draft.id}
            disabled={busy}
            onValueChange={(id) => {
              const role = config.roles.find((role) => role.id === id);
              if (role) update(role);
            }}
          >
            <SelectTrigger data-testid="authorization-role-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.roles.map((role) => (
                <SelectItem key={role.id} value={role.id} data-testid={`authorization-role-${role.id}`}>
                  {role.name}
                </SelectItem>
              ))}
              {draft.revision === 0 && <SelectItem value="new">{t("authorization.newRole")}</SelectItem>}
            </SelectContent>
          </Select>
        </Field>
        {canCreate && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            data-testid="authorization-add-role"
            onClick={() => update({ id: "new", name: "", builtIn: false, revision: 0, grants: [] })}
          >
            {t("authorization.addRole")}
          </Button>
        )}
      </div>
      {draft.builtIn ? (
        <p className="admin-hint" data-testid="authorization-administrator-protection">
          {t("authorization.administratorProtection")}
        </p>
      ) : (
        <Field label={t("authorization.roleName")} className="authorization-role-name">
          <Input
            data-testid="authorization-role-name"
            value={draft.name}
            maxLength={120}
            disabled={!editable || busy}
            onChange={(event) => update({ ...draft, name: event.currentTarget.value })}
          />
        </Field>
      )}
      <p className="admin-hint">{t("authorization.conditionsHelp")}</p>
      <div className="authorization-grants">
        <table data-testid="authorization-grants">
          <thead>
            <tr>
              <th>{t("authorization.resource")}</th>
              <th>{t("authorization.operation")}</th>
              <th>{t("authorization.access")}</th>
            </tr>
          </thead>
          <tbody>
            {config.accesses
              .filter((access) => access.configurable)
              .map((access) => {
                const labels = authorizationLabels[access.access];
                const resourceLabel = labels ? t(labels.resource) : access.resource;
                const operationLabel = labels ? t(labels.operation) : access.operation;
                const value = draft.grants.find((grant) => grant.access === access.access)?.condition ?? "none";
                return (
                  <tr key={access.access}>
                    <td>{resourceLabel}</td>
                    <td>{operationLabel}</td>
                    <td>
                      <Select
                        value={value}
                        disabled={!editable || busy}
                        onValueChange={(condition) =>
                          update({
                            ...draft,
                            grants: [
                              ...draft.grants.filter((grant) => grant.access !== access.access),
                              ...(condition === "none"
                                ? []
                                : [{ access: access.access, condition: condition as AuthorizationCondition }]),
                            ],
                          })
                        }
                      >
                        <SelectTrigger
                          data-testid={`authorization-access-${access.access}`}
                          aria-label={`${resourceLabel} · ${operationLabel}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" data-testid={`authorization-condition-${access.access}-none`}>
                            {t("authorization.none")}
                          </SelectItem>
                          {access.conditions.map((condition) => (
                            <SelectItem
                              key={condition}
                              value={condition}
                              data-testid={`authorization-condition-${access.access}-${condition}`}
                            >
                              {t(`authorization.condition.${condition}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <div className="settings-actions">
        {saved && (
          <span className="record-state" data-save="saved" role="status" data-testid="authorization-saved">
            {t("authorization.saved")}
          </span>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="secondary"
            data-testid="authorization-delete-role"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
          >
            {t("authorization.deleteRole")}
          </Button>
        )}
        {editable && (
          <Button
            type="button"
            data-testid="authorization-save-role"
            disabled={busy || !draft.name.trim()}
            onClick={() => void save()}
          >
            {t(busy ? "common.saving" : "common.save")}
          </Button>
        )}
      </div>
      <Modal
        open={deleteOpen}
        title={t("authorization.deleteRole")}
        onClose={() => {
          if (!busy) setDeleteOpen(false);
        }}
      >
        <div className="modal-form">
          <RequestErrorBanner error={error} />
          <p>{t("authorization.deleteConfirm", { name: draft.name })}</p>
          <div className="dialog-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              data-testid="authorization-confirm-delete"
              onClick={() => void remove()}
            >
              {t("authorization.deleteRole")}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
