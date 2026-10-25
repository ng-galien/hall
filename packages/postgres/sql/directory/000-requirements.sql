-- Directory model requirement catalogue
-- =====================================
--
-- Functional identifiers use HALL-FR-DIR-NNN. Technical identifiers use
-- HALL-TR-DIR-NNN. Numbers advance by ten and are never reused.

-- @implements-requirement HALL-FR-DIR-010
-- A contact belongs to the Hall directory whether or not that person holds a
-- council mandate.

-- @implements-requirement HALL-FR-DIR-020
-- At most one CouncilTerm is active at a time. Its expected member count is
-- mandatory and strictly positive.

-- @implements-requirement HALL-FR-DIR-030
-- A CouncilMember is a dated mandate of one Contact in one CouncilTerm.

-- @implements-requirement HALL-FR-DIR-040
-- A Contact cannot hold two active council mandates simultaneously.

-- @implements-requirement HALL-FR-DIR-050
-- The number of active CouncilMembers cannot exceed the expected member count
-- of the active CouncilTerm, including under concurrent writes.

-- @implements-requirement HALL-FR-DIR-060
-- A Contact can be archived only after its active council mandate has ended,
-- and an archived Contact cannot receive or recover an active mandate.

-- @implements-requirement HALL-FR-DIR-070
-- A mandate end date cannot precede its start date.

-- @implements-requirement HALL-TR-DIR-010
-- Directory and mandate entities use UUID primary keys and real foreign keys.

-- @implements-requirement HALL-TR-DIR-020
-- Row-local and referential invariants use CHECK, UNIQUE and FOREIGN KEY
-- constraints inline whenever PostgreSQL permits it.

-- @implements-requirement HALL-TR-DIR-030
-- Active-member writes lock the singleton active CouncilTerm before counting
-- seats, so two concurrent transactions cannot both claim the last seat.

-- @implements-requirement HALL-TR-DIR-040
-- Runtime roles mutate directory state only through named hall_api functions.

-- @implements-requirement HALL-FR-DIR-080
-- A CouncilCommittee exists independently from its current memberships and can
-- be archived without losing its history.

-- @implements-requirement HALL-FR-DIR-090
-- A Contact has at most one active membership in a given committee.

-- @implements-requirement HALL-FR-DIR-100
-- An active CommitteeMembership requires both an active CouncilCommittee and an
-- unarchived Contact.

-- Retired HALL-FR-DIR-110: memberships now reference contacts, independently
-- from council mandates. Membership start and end dates remain ordered.

-- @implements-requirement HALL-FR-DIR-120
-- Archiving a committee ends its active memberships on the archive date.
-- Ending a council mandate does not end contact memberships.

-- @implements-requirement HALL-FR-DIR-130
-- A known rank is nonnegative and unique within a council term, across all roles.
-- Unknown ranks remain null; the role and rank are separate data.

-- @implements-requirement HALL-FR-DIR-140
-- External representations have independent dated contact memberships with primary
-- and alternate roles. Multiple primary or alternate representatives are possible;
-- no pairing or council mandate constraint is inferred.
