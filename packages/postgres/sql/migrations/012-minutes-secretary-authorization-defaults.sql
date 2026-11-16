-- @implements-requirement HALL-FR-MIN-300
-- Apply the minutes secretary default once; a later administrator change must survive upgrades.
DO $$
BEGIN
  IF EXISTS (SELECT FROM hall_meta.data_migration WHERE name='minutes-secretary-authorization-defaults') THEN RETURN; END IF;
  INSERT INTO hall.authorization_grant(role,access,condition)
    SELECT d.role,d.access,d.condition FROM hall.authorization_default_grant d
    JOIN hall.authorization_role r ON r.id=d.role
    WHERE d.access='minutes.draft' AND d.condition='minutesSecretary'
    ON CONFLICT (role,access) DO NOTHING;
  INSERT INTO hall_meta.data_migration(name) VALUES ('minutes-secretary-authorization-defaults');
END $$;
