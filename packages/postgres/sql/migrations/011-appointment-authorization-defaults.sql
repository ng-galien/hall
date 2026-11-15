-- @implements-requirement HALL-FR-CAL-240
-- Apply the appointment defaults once; a later administrator change must survive upgrades.
DO $$
BEGIN
  IF EXISTS (SELECT FROM hall_meta.data_migration WHERE name='appointment-authorization-defaults') THEN RETURN; END IF;
  INSERT INTO hall.authorization_grant(role,access,condition)
    SELECT d.role,d.access,d.condition FROM hall.authorization_default_grant d
    JOIN hall.authorization_role r ON r.id=d.role
    WHERE d.access IN ('appointment.create','appointment.manage')
    ON CONFLICT (role,access) DO NOTHING;
  INSERT INTO hall_meta.data_migration(name) VALUES ('appointment-authorization-defaults');
END $$;
