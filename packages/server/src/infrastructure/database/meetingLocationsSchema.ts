/** Hall's ordered venue catalogue. The first entry is the default; meetings keep their own location text. */
export const meetingLocationsSchema = `
  CREATE TABLE hall_meeting_locations (
    -- @functional-requirement HALL-FR-LOC-010 LOCATION_BELONGS_TO_HALL: every location belongs to the Hall singleton.
    hall_id TEXT NOT NULL DEFAULT 'hall' REFERENCES hall_settings(id) CHECK (hall_id = 'hall'),
    -- @functional-requirement HALL-FR-LOC-020 LOCATION_ORDER_DEFINES_DEFAULT: positive, unique ranks define one unambiguous default (the first entry).
    position INTEGER PRIMARY KEY CHECK (position > 0),
    -- @functional-requirement HALL-FR-LOC-030 LOCATION_NAME_IS_NORMALIZED_AND_UNIQUE: names are non-empty, normalized and unique within Hall.
    name TEXT NOT NULL UNIQUE CHECK (name = trim(name) AND length(name) BETWEEN 1 AND 200)
  );
`;
