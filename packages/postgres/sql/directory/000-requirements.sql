-- Directory model requirement catalogue
-- =====================================
--
-- Functional identifiers use HALL-FR-DIR-NNN. Technical identifiers use
-- HALL-TR-DIR-NNN. Numbers advance by ten and are never reused.

-- @requirement-reference HALL-FR-DIR-010 CONTACT_EXISTS_INDEPENDENTLY:
-- A contact belongs to the Hall directory whether or not that person holds a
-- council mandate.

-- @requirement-reference HALL-FR-DIR-020 ONE_ACTIVE_COUNCIL_TERM:
-- At most one CouncilTerm is active at a time. Its expected member count is
-- mandatory and strictly positive.

-- @requirement-reference HALL-FR-DIR-030 MEMBER_BELONGS_TO_TERM:
-- A CouncilMember is a dated mandate of one Contact in one CouncilTerm.

-- @requirement-reference HALL-FR-DIR-040 ONE_ACTIVE_MANDATE_PER_CONTACT:
-- A Contact cannot hold two active council mandates simultaneously.

-- @requirement-reference HALL-FR-DIR-050 ACTIVE_TERM_CAPACITY_IS_ENFORCED:
-- The number of active CouncilMembers cannot exceed the expected member count
-- of the active CouncilTerm, including under concurrent writes.

-- @requirement-reference HALL-FR-DIR-060 ARCHIVED_CONTACT_HAS_NO_ACTIVE_MANDATE:
-- A Contact can be archived only after its active council mandate has ended,
-- and an archived Contact cannot receive or recover an active mandate.

-- @requirement-reference HALL-FR-DIR-070 MANDATE_DATES_ARE_ORDERED:
-- A mandate end date cannot precede its start date.

-- @technical-requirement HALL-TR-DIR-010 UUID_IDENTITIES:
-- Directory and mandate entities use UUID primary keys and real foreign keys.

-- @technical-requirement HALL-TR-DIR-020 DECLARATIVE_INVARIANTS_ARE_INLINE:
-- Row-local and referential invariants use CHECK, UNIQUE and FOREIGN KEY
-- constraints inline whenever PostgreSQL permits it.

-- @requirement-reference HALL-TR-DIR-030 CONCURRENT_CAPACITY_IS_SERIALIZED:
-- Active-member writes lock the singleton active CouncilTerm before counting
-- seats, so two concurrent transactions cannot both claim the last seat.

-- @technical-requirement HALL-TR-DIR-040 WRITES_ARE_NAMED:
-- Runtime roles mutate directory state only through named hall_api functions.

-- @requirement-reference HALL-FR-DIR-080 COMMITTEE_IS_INDEPENDENT:
-- A CouncilCommittee exists independently from its current memberships and can
-- be archived without losing its history.

-- @requirement-reference HALL-FR-DIR-090 ONE_ACTIVE_COMMITTEE_MEMBERSHIP:
-- A CouncilMember has at most one active membership in a given committee.

-- @requirement-reference HALL-FR-DIR-100 ACTIVE_MEMBERSHIP_REQUIRES_ACTIVE_ENTITIES:
-- An active CommitteeMembership requires both an active CouncilCommittee and an
-- active CouncilMember mandate.

-- @requirement-reference HALL-FR-DIR-110 MEMBERSHIP_DATES_FIT_MANDATE:
-- Committee membership dates are ordered and remain inside the dates of the
-- corresponding council mandate.

-- @requirement-reference HALL-FR-DIR-120 CLOSURE_ENDS_MEMBERSHIPS:
-- Archiving a committee or ending a council mandate ends its active committee
-- memberships atomically on the same calendar date.
