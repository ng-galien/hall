# Configurable authorization

The built-in administrator manages roles in **Configuration → Permissions**. The administrator always has every application permission and cannot be renamed, deleted, or deprived of a permission. Hall prevents disabling, revoking or removing the administrator role from the last active administrator, including concurrent changes. Initial installation creates the first administrator before ordinary account use.

The initial roles are administrator, secretariat (`clerk`), contributor and councillor. Their former matrix is installed once as the starting configuration. Ordinary roles can be renamed, changed, created and deleted when no account holds them. Changing the configuration does not reset existing accounts or assignments. Upgrades and restarts preserve changes, including removed grants.

Select a role, give it a name, choose each permission and its condition, and save. Assign the role from **Users**. Multiple roles combine their grants; an absent grant denies the operation. Changes take effect on the next server request, including an existing session. A stale editor must reload before saving; it cannot silently overwrite a newer revision. Role changes are audited with their prior and resulting values.

The supplied access catalogue covers reading, exports, ordinary writes and reserved management operations. Reading includes metadata, search, draft content and previews. Export controls original-file downloads and generated files separately. Live connections require reading and are checked again against the current account and policy. Siren links and actions reflect the effective server rights; hidden controls are not the enforcement mechanism.

Conditions are selected from the existing predicates applicable to the permission:

- `always`: the grant applies without an additional authorization condition.
- `meetingOfficer`: meeting conduct is allowed for the current chair or secretary, including a recorded chair handover.
- `ownPersonalWorkspace`: personal-resource writing or deletion is limited to the linked contact's own personal workspace and requires an active council mandate. Assigning a role with this condition provisions that workspace through the existing workflow.

Reading is global within the application: the conditions above apply to their documented write/conduct permissions, not row filtering. There is no arbitrary expression or SQL editor. Session access, initial installation and administration of the role policy remain system responsibilities. Authorization grants do not bypass domain invariants such as a closed meeting or locked adopted content.

PostgreSQL owns the role catalogue, grants and evaluation. `/api/roles` returns the administrative configuration, access catalogue, and executable Siren actions. `/api/roles/options` supplies assignment labels without exposing the policy editor to ordinary accounts. The role resource carries a revision used for update and delete. The client uses these representations and does not maintain a competing role matrix.

The local development administrator uses the same built-in administrator permission identity. This development access is separate from production authentication and does not create or rename a personal account. Existing demonstration accounts and data are preserved.
