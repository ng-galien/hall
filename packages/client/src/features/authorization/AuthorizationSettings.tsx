import {
  type AuthorizationCondition,
  type AuthorizationConfiguration,
  type AuthorizationRole,
  findSirenAction,
  type SirenEmbeddedEntity,
  type SirenEntity,
} from "@hall/api-contract";
import { useCallback, useEffect, useId, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
  const fieldId = useId();
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
    <section className="grid gap-5" data-testid="authorization-settings">
      <div>
        <h2 className="text-lg font-medium">{t("authorization.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("authorization.description")}</p>
      </div>
      {!deleteOpen && <RequestErrorBanner error={error} />}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-role`}>{t("authorization.role")}</Label>
          <Select
            value={draft.revision === 0 ? "new" : draft.id}
            disabled={busy}
            onValueChange={(id) => {
              const role = config.roles.find((role) => role.id === id);
              if (role) update(role);
            }}
          >
            <SelectTrigger id={`${fieldId}-role`} data-testid="authorization-role-select">
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
        </div>
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
        <p
          className="rounded-lg border border-border bg-surface p-4 text-sm"
          data-testid="authorization-administrator-protection"
        >
          {t("authorization.administratorProtection")}
        </p>
      ) : (
        <div className="grid max-w-lg gap-1.5">
          <Label htmlFor={`${fieldId}-name`}>{t("authorization.roleName")}</Label>
          <Input
            id={`${fieldId}-name`}
            data-testid="authorization-role-name"
            value={draft.name}
            maxLength={120}
            disabled={!editable || busy}
            onChange={(event) => update({ ...draft, name: event.currentTarget.value })}
          />
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t("authorization.conditionsHelp")}</p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm" data-testid="authorization-grants">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-4 py-3 font-medium">{t("authorization.resource")}</th>
              <th className="px-4 py-3 font-medium">{t("authorization.operation")}</th>
              <th className="px-4 py-3 font-medium">{t("authorization.access")}</th>
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
                  <tr key={access.access} className="border-t border-border">
                    <td className="px-4 py-3 align-top font-medium">{resourceLabel}</td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{operationLabel}</td>
                    <td className="px-4 py-3">
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
                          className="w-full min-w-44"
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
      <div className="flex flex-wrap items-center gap-3">
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
        {saved && (
          <p role="status" data-testid="authorization-saved">
            {t("authorization.saved")}
          </p>
        )}
      </div>
      <Modal
        open={deleteOpen}
        title={t("authorization.deleteRole")}
        onClose={() => {
          if (!busy) setDeleteOpen(false);
        }}
      >
        <div className="grid gap-4">
          <RequestErrorBanner error={error} />
          <p>{t("authorization.deleteConfirm", { name: draft.name })}</p>
          <Button
            type="button"
            disabled={busy}
            data-testid="authorization-confirm-delete"
            onClick={() => void remove()}
          >
            {t("authorization.deleteRole")}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
