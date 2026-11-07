-- @implements-requirement HALL-FR-DOC-350
-- @implements-requirement HALL-TR-CTX-030
-- @implements-requirement HALL-FR-USR-050
-- The authorization rules of Hall, delivered with the schema: the access
-- catalogue (resource x operation), the role matrix with its conditions, and the
-- single access of each API action. The server pushes the roles and the linked
-- contact of the caller; hall.allows answers for an action and its target.
CREATE VIEW hall.access AS
  SELECT access, resource, operation
  FROM (
    VALUES
      ('read', 'Toutes les ressources', 'lire, brouillons compris'),
      ('export', 'Toutes les ressources', 'exporter et générer un document à télécharger'),
      ('session', 'Session de connexion', 'fermer, changer son mot de passe'),
      ('installation', 'Installation', 'créer le premier administrateur'),
      ('contact.manage', 'Contact', 'gérer (créer, modifier, archiver)'),
      ('member.manage', 'Membre du conseil', 'gérer (créer, modifier)'),
      ('council-term.configure', 'Mandature', 'configurer'),
      ('delegation.manage', 'Délégation', 'gérer (créer, modifier, archiver, membres)'),
      ('committee.manage', 'Commission', 'gérer (créer, modifier, archiver, membres)'),
      ('council-business.write', 'Affaire', 'créer et modifier (importer, rattacher commissions et ressources, ordonner)'),
      ('council-business.delete', 'Affaire', 'supprimer'),
      ('common-resource.write', 'Ressource de l’espace commun', 'créer et modifier'),
      ('common-resource.delete', 'Ressource de l’espace commun', 'supprimer'),
      ('personal-resource.write', 'Dossier personnel (contenu)', 'créer et modifier'),
      ('personal-resource.delete', 'Dossier personnel (contenu)', 'supprimer'),
      ('personal-workspace.manage', 'Dossier personnel (le dossier lui-même)', 'créer, renommer, déplacer, supprimer'),
      ('template.write', 'Modèle de document', 'créer et modifier'),
      ('template.delete', 'Modèle de document', 'supprimer'),
      ('meeting.prepare', 'Séance', 'préparer (créer, convoquer, arrêter et rouvrir l’ordre du jour, désigner les officiers)'),
      ('agenda-item.prepare', 'Point d’ordre du jour', 'préparer (inscrire, retirer, reprogrammer)'),
      ('decision.draft', 'Délibération', 'rédiger le projet et le figer'),
      ('minutes.draft', 'Procès-verbal', 'rédiger et générer'),
      ('meeting.conduct', 'Séance', 'conduire (présences, quorum, ouverture, passation, reconvocation, question diverse, huis clos, clôture)'),
      ('agenda-item.conduct', 'Point d’ordre du jour', 'conduire (ouvrir, terminer, ajourner, déport, notes)'),
      ('ballot.record', 'Scrutin', 'enregistrer (préparer et confirmer le résultat)'),
      ('user.list', 'Compte', 'lister'),
      ('user.manage', 'Compte', 'gérer (créer, modifier, phrase de passe, révoquer, réactiver, désactiver, attribuer les rôles)'),
      ('settings.manage', 'Réglages de la commune', 'modifier (dont le patrimoine communal)'),
      ('audit.read', 'Journal d’audit', 'lire'),
      ('authorization.manage', 'Rôles et autorisations', 'configurer (administrateur intégré)')
  ) AS entry(access, resource, operation);

CREATE VIEW hall.authorization_default_grant AS
  SELECT role, access, condition
  FROM (
    VALUES
      ('administrator', 'read', 'always'),
      ('clerk', 'read', 'always'),
      ('administrator', 'export', 'always'),
      ('clerk', 'export', 'always'),
      ('administrator', 'session', 'always'),
      ('clerk', 'session', 'always'),
      ('administrator', 'contact.manage', 'always'),
      ('clerk', 'contact.manage', 'always'),
      ('administrator', 'member.manage', 'always'),
      ('clerk', 'member.manage', 'always'),
      ('administrator', 'council-term.configure', 'always'),
      ('clerk', 'council-term.configure', 'always'),
      ('administrator', 'delegation.manage', 'always'),
      ('clerk', 'delegation.manage', 'always'),
      ('administrator', 'committee.manage', 'always'),
      ('clerk', 'committee.manage', 'always'),
      ('administrator', 'council-business.write', 'always'),
      ('clerk', 'council-business.write', 'always'),
      ('administrator', 'council-business.delete', 'always'),
      ('clerk', 'council-business.delete', 'always'),
      ('administrator', 'common-resource.write', 'always'),
      ('clerk', 'common-resource.write', 'always'),
      ('administrator', 'common-resource.delete', 'always'),
      ('clerk', 'common-resource.delete', 'always'),
      ('administrator', 'personal-resource.write', 'always'),
      ('clerk', 'personal-resource.write', 'always'),
      ('administrator', 'personal-resource.delete', 'always'),
      ('clerk', 'personal-resource.delete', 'always'),
      ('administrator', 'personal-workspace.manage', 'always'),
      ('clerk', 'personal-workspace.manage', 'always'),
      ('administrator', 'template.write', 'always'),
      ('clerk', 'template.write', 'always'),
      ('administrator', 'template.delete', 'always'),
      ('clerk', 'template.delete', 'always'),
      ('administrator', 'meeting.prepare', 'always'),
      ('clerk', 'meeting.prepare', 'always'),
      ('administrator', 'agenda-item.prepare', 'always'),
      ('clerk', 'agenda-item.prepare', 'always'),
      ('administrator', 'decision.draft', 'always'),
      ('clerk', 'decision.draft', 'always'),
      ('administrator', 'minutes.draft', 'always'),
      ('clerk', 'minutes.draft', 'always'),
      ('administrator', 'meeting.conduct', 'always'),
      ('clerk', 'meeting.conduct', 'meetingOfficer'),
      ('administrator', 'agenda-item.conduct', 'always'),
      ('clerk', 'agenda-item.conduct', 'meetingOfficer'),
      ('administrator', 'ballot.record', 'always'),
      ('clerk', 'ballot.record', 'meetingOfficer'),
      ('administrator', 'user.list', 'always'),
      ('clerk', 'user.list', 'always'),
      ('administrator', 'user.manage', 'always'),
      ('administrator', 'settings.manage', 'always'),
      ('clerk', 'settings.manage', 'always'),
      ('administrator', 'audit.read', 'always'),
      ('clerk', 'audit.read', 'always'),
      ('contributor', 'session', 'always'),
      ('contributor', 'read', 'always'),
      ('contributor', 'export', 'always'),
      ('contributor', 'council-business.write', 'always'),
      ('contributor', 'common-resource.write', 'always'),
      ('contributor', 'agenda-item.conduct', 'meetingOfficer'),
      ('contributor', 'ballot.record', 'meetingOfficer'),
      ('contributor', 'meeting.conduct', 'meetingOfficer'),
      ('councillor', 'session', 'always'),
      ('councillor', 'read', 'always'),
      ('councillor', 'export', 'always'),
      ('councillor', 'personal-resource.write', 'ownPersonalWorkspace'),
      ('councillor', 'personal-resource.delete', 'ownPersonalWorkspace'),
      ('councillor', 'agenda-item.conduct', 'meetingOfficer'),
      ('councillor', 'ballot.record', 'meetingOfficer'),
      ('councillor', 'meeting.conduct', 'meetingOfficer')
  ) AS entry(role, access, condition);

-- @implements-requirement HALL-FR-USR-060
CREATE TABLE hall.authorization_role (
  id TEXT PRIMARY KEY CONSTRAINT authorization_role_id CHECK (id ~ '^[a-z][a-z0-9-]*$'::text AND length(id) <= 80),
  name TEXT NOT NULL CONSTRAINT authorization_role_name CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 120),
  revision INTEGER NOT NULL DEFAULT 1 CONSTRAINT authorization_role_revision CHECK (revision > 0)
);
CREATE TABLE hall.authorization_grant (
  role TEXT NOT NULL REFERENCES hall.authorization_role(id) ON DELETE CASCADE,
  access TEXT NOT NULL,
  condition TEXT NOT NULL CONSTRAINT authorization_grant_condition CHECK (condition = ANY (ARRAY['always'::text, 'meetingOfficer'::text, 'ownPersonalWorkspace'::text])),
  PRIMARY KEY (role, access)
);
CREATE VIEW hall.role_access AS
  SELECT role, access, condition FROM hall.authorization_grant;
ALTER TABLE hall.authorization_role OWNER TO hall_owner;
ALTER TABLE hall.authorization_grant OWNER TO hall_owner;
ALTER VIEW hall.authorization_default_grant OWNER TO hall_owner;
REVOKE ALL ON hall.authorization_role, hall.authorization_grant, hall.authorization_default_grant FROM PUBLIC;

CREATE VIEW hall.action_access AS
  SELECT action, access
  FROM (
    VALUES
      ('resource.search-legal-references', 'read'),
      ('template.preview', 'read'),
      ('template.preview-pdf', 'read'),
      ('resource.convert-spreadsheet-table', 'read'),
      ('council-business.export-bundle', 'export'),
      ('template.generate', 'export'),
      ('resource.generate-event-invitation', 'export'),
      ('meeting.generate-dossier', 'export'),
      ('session.logout', 'session'),
      ('session.change-password', 'session'),
      ('session.bootstrap', 'installation'),
      ('contact.create', 'contact.manage'),
      ('contact.update', 'contact.manage'),
      ('contact.archive', 'contact.manage'),
      ('member.create', 'member.manage'),
      ('member.update', 'member.manage'),
      ('council-term.configure', 'council-term.configure'),
      ('delegation.create', 'delegation.manage'),
      ('delegation.update', 'delegation.manage'),
      ('delegation.archive', 'delegation.manage'),
      ('delegation.add-membership', 'delegation.manage'),
      ('delegation.update-membership', 'delegation.manage'),
      ('delegation.end-membership', 'delegation.manage'),
      ('committee.create', 'committee.manage'),
      ('committee.update', 'committee.manage'),
      ('committee.archive', 'committee.manage'),
      ('committee.add-membership', 'committee.manage'),
      ('committee.update-membership', 'committee.manage'),
      ('committee.end-membership', 'committee.manage'),
      ('council-business.create', 'council-business.write'),
      ('council-business.create-prepared-subject', 'council-business.write'),
      ('council-business.import-bundle', 'council-business.write'),
      ('council-business.associate-committee', 'council-business.write'),
      ('council-business.dissociate-committee', 'council-business.write'),
      ('council-business.associate-resource', 'council-business.write'),
      ('council-business.dissociate-resource', 'council-business.write'),
      ('council-business.reorder-resources', 'council-business.write'),
      ('council-business.move-subject', 'council-business.write'),
      ('council-business.merge', 'council-business.delete'),
      ('council-business.delete', 'council-business.delete'),
      ('resource.create', 'common-resource.write'),
      ('resource.create-document', 'common-resource.write'),
      ('resource.import-spreadsheet', 'common-resource.write'),
      ('resource.import-geographic-layer', 'common-resource.write'),
      ('resource.create-editor-asset', 'common-resource.write'),
      ('resource.relocate', 'common-resource.write'),
      ('resource.update-metadata', 'common-resource.write'),
      ('resource.update-content', 'common-resource.write'),
      ('resource.replace-document-content', 'common-resource.write'),
      ('resource.link-geographic-layer', 'common-resource.write'),
      ('resource.unlink-geographic-layer', 'common-resource.write'),
      ('resource.create-geographic-feature-note', 'common-resource.write'),
      ('resource.resolve-legal-reference', 'common-resource.write'),
      ('resource.refresh-legal-reference', 'common-resource.write'),
      ('resource.delete', 'common-resource.delete'),
      ('personal-workspace.create', 'personal-workspace.manage'),
      ('personal-workspace.restructure', 'personal-workspace.manage'),
      ('template.create', 'template.write'),
      ('template.update', 'template.write'),
      ('template.delete', 'template.delete'),
      ('meeting.provision-initial', 'meeting.prepare'),
      ('meeting.schedule', 'meeting.prepare'),
      ('meeting.prepare', 'meeting.prepare'),
      ('meeting.set-officers', 'meeting.prepare'),
      ('meeting.create-and-schedule-business', 'meeting.prepare'),
      ('meeting.reorder-agenda', 'meeting.prepare'),
      ('meeting.reopen-agenda', 'meeting.prepare'),
      ('meeting.reset-agenda-revision', 'meeting.prepare'),
      ('meeting.generate-notice', 'meeting.prepare'),
      ('meeting.generate-notice-message', 'meeting.prepare'),
      ('agenda-item.schedule', 'agenda-item.prepare'),
      ('agenda-item.schedule-prepared', 'agenda-item.prepare'),
      ('agenda-item.deprogram', 'agenda-item.prepare'),
      ('agenda-item.reprogram', 'agenda-item.prepare'),
      ('council-business.schedule-decision-proposal', 'agenda-item.prepare'),
      ('council-business.schedule-open-question', 'agenda-item.prepare'),
      ('decision.update-draft', 'decision.draft'),
      ('decision.freeze', 'decision.draft'),
      ('minutes.update-draft', 'minutes.draft'),
      ('minutes.generate', 'minutes.draft'),
      ('meeting.record-attendance', 'meeting.conduct'),
      ('meeting.record-attendance-events', 'meeting.conduct'),
      ('meeting.record-quorum', 'meeting.conduct'),
      ('meeting.record-reconvocation', 'meeting.conduct'),
      ('meeting.record-opening', 'meeting.conduct'),
      ('meeting.add-open-question', 'meeting.conduct'),
      ('meeting.close', 'meeting.conduct'),
      ('meeting.mark-stale', 'meeting.conduct'),
      ('meeting.record-officer-change', 'meeting.conduct'),
      ('meeting.declare-auxiliary-attendance', 'meeting.conduct'),
      ('meeting.correct-auxiliary-attendance', 'meeting.conduct'),
      ('meeting.record-closed-session', 'meeting.conduct'),
      ('agenda-item.start', 'agenda-item.conduct'),
      ('agenda-item.complete', 'agenda-item.conduct'),
      ('agenda-item.adjourn', 'agenda-item.conduct'),
      ('agenda-item.record-recusal', 'agenda-item.conduct'),
      ('agenda-item.update-notes', 'agenda-item.conduct'),
      ('ballot.preview', 'ballot.record'),
      ('ballot.confirm', 'ballot.record'),
      ('user.list', 'user.list'),
      ('user.create', 'user.manage'),
      ('user.update', 'user.manage'),
      ('user.reset-password', 'user.manage'),
      ('user.disable', 'user.manage'),
      ('user.revoke-access', 'user.manage'),
      ('user.reactivate', 'user.manage'),
      ('user.generate-passphrase', 'user.manage'),
      ('user.assign-role', 'user.manage'),
      ('role.create', 'authorization.manage'),
      ('role.update', 'authorization.manage'),
      ('role.delete', 'authorization.manage'),
      ('role.list', 'authorization.manage'),
      ('application.read', 'read'),
      ('application.export', 'export'),
      ('settings.update', 'settings.manage'),
      ('resource.import-municipal-property', 'settings.manage'),
      ('audit-event.list', 'audit.read')
  ) AS entry(action, access);

ALTER VIEW hall.access OWNER TO hall_owner;
ALTER VIEW hall.role_access OWNER TO hall_owner;
ALTER VIEW hall.action_access OWNER TO hall_owner;
REVOKE ALL ON hall.access, hall.role_access, hall.action_access FROM PUBLIC;

-- An action on a resource takes the access of its location: the same actions
-- write or delete in the common workspace or in a personal folder.
CREATE FUNCTION hall.location_access(action_access TEXT, target JSONB)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  IF target ? 'location' AND hall.is_personal_workspace_location(target ->> 'location') THEN
    RETURN CASE action_access
      WHEN 'common-resource.write' THEN 'personal-resource.write'
      WHEN 'common-resource.delete' THEN 'personal-resource.delete'
      ELSE action_access
    END;
  END IF;
  RETURN action_access;
END
$function$;

-- @implements-requirement HALL-FR-USR-030
-- @implements-requirement HALL-FR-WSP-390
CREATE FUNCTION hall.allows(target_action TEXT, target JSONB DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  granted_access TEXT;
  caller_roles JSONB := coalesce(nullif(current_setting('hall.roles', true), '')::jsonb, '[]'::jsonb);
  caller_contact TEXT := nullif(current_setting('hall.contact_id', true), '');
  scope JSONB := coalesce(target, '{}'::jsonb);
BEGIN
  SELECT hall.location_access(mapping.access, scope) INTO granted_access
  FROM hall.action_access AS mapping WHERE mapping.action = target_action;
  IF granted_access IS NULL THEN
    RETURN FALSE;
  END IF;
  IF caller_roles ? 'administrator' THEN RETURN TRUE; END IF;
  IF granted_access = 'authorization.manage' THEN RETURN FALSE; END IF;
  IF granted_access = 'session' THEN RETURN jsonb_array_length(caller_roles) > 0; END IF;
  -- Without a location, a resource action is admitted where the caller may
  -- write or delete somewhere; the operation then checks its own location.
  IF NOT scope ? 'location' AND granted_access IN ('common-resource.write', 'common-resource.delete') THEN
    RETURN hall.holds_access(granted_access)
      OR hall.holds_access(replace(granted_access, 'common-', 'personal-'));
  END IF;
  RETURN EXISTS (
    SELECT FROM hall.role_access AS grant_row
    WHERE caller_roles ? grant_row.role
      AND grant_row.access = granted_access
      AND CASE grant_row.condition
        WHEN 'always' THEN TRUE
        WHEN 'meetingOfficer' THEN scope ? 'meetingId'
          AND hall.is_meeting_officer((scope ->> 'meetingId')::UUID)
        WHEN 'ownPersonalWorkspace' THEN scope ? 'location' AND caller_contact IS NOT NULL
          AND hall.personal_workspace_owner(scope ->> 'location')::TEXT = caller_contact
          AND EXISTS (
            SELECT FROM hall.council_member AS member
            WHERE member.contact::TEXT = caller_contact AND member.term_ended_on IS NULL
          )
        ELSE FALSE
      END
  );
END
$function$;

ALTER FUNCTION hall.allows(TEXT, JSONB) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall.allows(TEXT, JSONB) FROM PUBLIC;

-- Whether a role of the caller holds the access, whatever its condition: used
-- only to offer an affordance whose target is checked when the action runs.
CREATE FUNCTION hall.holds_access(target_access TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(nullif(current_setting('hall.roles', true), '')::jsonb, '[]'::jsonb) ? 'administrator' OR EXISTS (
    SELECT FROM hall.role_access AS grant_row
    WHERE coalesce(nullif(current_setting('hall.roles', true), '')::jsonb, '[]'::jsonb) ? grant_row.role
      AND grant_row.access = target_access
  )
$function$;

ALTER FUNCTION hall.holds_access(TEXT) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall.holds_access(TEXT) FROM PUBLIC;

CREATE FUNCTION hall_api.allows(target_action TEXT, target JSONB DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.allows(target_action, target)
$function$;

ALTER FUNCTION hall_api.allows(TEXT, JSONB) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall_api.allows(TEXT, JSONB) FROM PUBLIC;

CREATE FUNCTION hall_api.allowed_actions(target JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(jsonb_agg(mapping.action ORDER BY mapping.action), '[]'::jsonb)
  FROM hall.action_access AS mapping
  WHERE hall.allows(mapping.action, target)
$function$;

ALTER FUNCTION hall_api.allowed_actions(JSONB) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall_api.allowed_actions(JSONB) FROM PUBLIC;

-- Installs the former matrix only for an empty catalog. Later startup and
-- upgrades never overwrite administrative choices, including removed grants.
CREATE FUNCTION hall.initialize_authorization_defaults()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
BEGIN
  LOCK TABLE hall.authorization_role IN EXCLUSIVE MODE;
  IF EXISTS (SELECT FROM hall.authorization_role) THEN RETURN; END IF;
  INSERT INTO hall.authorization_role(id, name) VALUES
    ('administrator', 'Administrateur'), ('clerk', 'Secrétariat'),
    ('contributor', 'Contributeur'), ('councillor', 'Conseiller');
  INSERT INTO hall.authorization_grant(role, access, condition)
    SELECT role, access, condition FROM hall.authorization_default_grant;
END;
$$;
ALTER FUNCTION hall.initialize_authorization_defaults() OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall.initialize_authorization_defaults() FROM PUBLIC;
SELECT hall.initialize_authorization_defaults();
