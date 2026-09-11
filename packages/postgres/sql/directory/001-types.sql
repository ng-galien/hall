-- @functional-requirement HALL-FR-DIR-030 MEMBER_BELONGS_TO_TERM:
CREATE TYPE hall.council_role AS ENUM ('mayor', 'deputyMayor', 'councillor');

CREATE TYPE hall.committee_role AS ENUM ('chair', 'viceChair', 'member', 'rapporteur', 'primary', 'alternate');
