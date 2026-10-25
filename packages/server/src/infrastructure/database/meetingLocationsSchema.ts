/** Hall's ordered venue catalogue. The first entry is the default; meetings keep their own location text. */
export const meetingLocationsSchema = `
  CREATE TABLE hall_meeting_locations (
    -- @implements-requirement HALL-FR-LOC-010
    hall_id TEXT NOT NULL DEFAULT 'hall' REFERENCES hall_settings(id) CHECK (hall_id = 'hall'),
    -- @implements-requirement HALL-FR-LOC-020
    position INTEGER PRIMARY KEY CHECK (position > 0),
    -- @implements-requirement HALL-FR-LOC-030
    name TEXT NOT NULL UNIQUE CHECK (name = trim(name) AND length(name) BETWEEN 1 AND 200)
  );
`;
