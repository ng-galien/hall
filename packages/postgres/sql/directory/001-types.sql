-- @implements-requirement HALL-FR-DIR-030
CREATE TYPE hall.council_role AS ENUM ('mayor', 'deputyMayor', 'councillor');

CREATE TYPE hall.committee_role AS ENUM ('chair', 'viceChair', 'member', 'rapporteur', 'primary', 'alternate');
