-- @implements-requirement HALL-FR-EML-050
-- Apply new built-in defaults once; a later administrator change must survive upgrades.
DO $$
BEGIN
  IF EXISTS (SELECT FROM hall_meta.data_migration WHERE name='mail-authorization-defaults') THEN RETURN; END IF;
  INSERT INTO hall.authorization_grant(role,access,condition)
    SELECT d.role,d.access,d.condition FROM hall.authorization_default_grant d
    JOIN hall.authorization_role r ON r.id=d.role
    WHERE d.access IN ('mail.create','mail.write','mail.delete','mail.send','mail-group.manage')
    ON CONFLICT (role,access) DO NOTHING;
  INSERT INTO hall_meta.data_migration(name) VALUES ('mail-authorization-defaults');
END $$;
