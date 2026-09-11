-- Canonical Hall SQLSTATE catalogue.
--
-- @technical-requirement HALL-TR-ERR-010 DECLARATIVE_CONSTRAINTS_KEEP_NATIVE_SQLSTATE:
-- Declarative PostgreSQL constraints keep their native SQLSTATE. In
-- particular, NOT NULL, foreign key, uniqueness and CHECK violations remain
-- 23502, 23503, 23505 and 23514; clients can refine them with the constraint
-- name carried by the database error.
--
-- @technical-requirement HALL-TR-ERR-020 BUSINESS_ERRORS_USE_STABLE_CUSTOM_SQLSTATE:
-- Trigger-enforced business invariants use the custom HV class below. These
-- codes are a stable machine-readable contract. The English RAISE message is
-- diagnostic only and may change without changing the code.
--
-- @technical-requirement HALL-TR-ERR-030 ERROR_CODES_TRACE_FUNCTIONAL_REQUIREMENTS:
-- Every business error code below identifies the functional requirement it
-- protects. Missing-reference diagnostics are deliberately not functional
-- requirements.
--
-- Meeting attendance
-- HV101  MEETING_ATTENDANCE_IMMUTABLE                 HALL-FR-ATT-080
-- HV102  MEETING_ATTENDANCE_AFTER_MEETING_START       HALL-FR-ATT-090
-- HV103  PROXY_HOLDER_INVALID                         HALL-FR-ATT-070
-- HV104  ATTENDANCE_DECLARATION_INVALID               HALL-FR-ATT-030
--
-- Council meeting
-- HV111  COUNCIL_MEETING_IMMUTABLE                    HALL-FR-MTG-030
-- HV112  COUNCIL_MEETING_INSERT_STARTED                HALL-FR-MTG-040
-- HV113  COUNCIL_MEETING_DEFINITION_IMMUTABLE          HALL-FR-MTG-050
-- HV114  COUNCIL_MEETING_ALREADY_STARTED               HALL-FR-MTG-060
-- HV116  COUNCIL_MEETING_INVALID_CLOSE                  HALL-FR-MTG-090
-- HV117  PREVIOUS_MINUTES_NOT_APPROVED                  HALL-FR-MTG-120
-- HV118  COUNCIL_MEETING_HAS_OPEN_BALLOT                HALL-FR-BAL-290
-- HV120  COUNCIL_MEETING_PREDECESSOR_NOT_CLOSED         HALL-FR-MTG-140
-- HV121  COUNCIL_MEETING_CLOSURE_INCOMPLETE             HALL-FR-MTG-110
-- HV122  COUNCIL_MEETING_SCHEDULE_INVALID                 HALL-FR-MTG-160
-- HV123  INITIAL_COUNCIL_MEETING_ALREADY_PROVISIONED      HALL-FR-MTG-180
-- HV124  COUNCIL_MEETING_OFFICERS_INVALID                  HALL-FR-MTG-240
--
-- Council business and agenda
-- HV212  AGENDA_ITEM_INSERT_ACTIVE                     HALL-FR-AGI-090
-- HV213  STARTED_AGENDA_ITEM_DELETE                    HALL-FR-AGI-100
-- HV214  AGENDA_ITEM_SUBJECT_CHANGE                    HALL-FR-AGI-110
-- HV215  DEPROGRAMMED_AGENDA_ITEM_START                HALL-FR-AGI-120
-- HV216  AGENDA_ITEM_MEETING_NOT_STARTED               HALL-FR-AGI-120
-- HV217  AGENDA_ITEM_INVALID_TEMPORAL_TRANSITION       HALL-FR-AGI-180
-- HV218  AGENDA_ITEM_START_IMMUTABLE                   HALL-FR-AGI-130
-- HV219  AGENDA_ITEM_COMPLETION_IMMUTABLE              HALL-FR-AGI-140
-- HV220  STARTED_AGENDA_ITEM_PLACEMENT_CHANGE          HALL-FR-AGI-190
-- HV221  AGENDA_ITEM_COMPLETION_WITHOUT_BALLOT         HALL-FR-AGI-160
-- HV222  AGENDA_SUBJECT_HAS_ANOTHER_BUSINESS           HALL-FR-BUS-030
-- HV223  CLOSED_MEETING_AGENDA_WRITE                    HALL-FR-AGI-270
-- HV224  COUNCIL_AGENDA_REORDER_INVALID                 HALL-FR-AGI-290
-- HV225  AGENDA_PROGRAMMED_POSITION_INVALID             HALL-FR-AGI-300
-- HV226  COMPLETED_AGENDA_ITEM_DEPROGRAM                HALL-FR-AGI-310
-- HV227  DEPROGRAMMED_AGENDA_ITEM_COMPLETE              HALL-FR-AGI-320
-- HV228  OPEN_BALLOT_AGENDA_ITEM_DEPROGRAM              HALL-FR-AGI-330
-- HV229  STARTED_DEPROGRAMMING_REVERSED                  HALL-FR-AGI-340
--
-- Ballot participation
-- HV301  BALLOT_PARTICIPATION_IMMUTABLE                HALL-FR-BAL-070
-- HV302  BALLOT_PARTICIPATION_AFTER_BALLOT_COMPLETION  HALL-FR-BAL-080
-- HV303  BALLOT_PARTICIPATION_WRONG_MEETING            HALL-FR-BAL-090
-- HV304  BALLOT_PARTICIPATION_NOT_ELIGIBLE             HALL-FR-BAL-100
--
-- Ballot
-- HV401  BALLOT_IMMUTABLE                              HALL-FR-BAL-200
-- HV402  BALLOT_INSERT_COMPLETED                        HALL-FR-BAL-210
-- HV403  BALLOT_MEETING_NOT_STARTED                     HALL-FR-BAL-220
-- HV404  BALLOT_AGENDA_ITEM_NOT_ACTIVE                  HALL-FR-BAL-230
-- HV405  BALLOT_DEFINITION_IMMUTABLE                    HALL-FR-BAL-240
-- HV406  BALLOT_ALREADY_COMPLETED                       HALL-FR-BAL-250
-- HV407  BALLOT_RESULT_MANUAL_CHANGE                    HALL-FR-BAL-260
-- HV408  BALLOT_VOTE_COUNT_MISMATCH                     HALL-FR-BAL-270
-- HV409  BALLOT_AGENDA_ITEM_NOT_ACTIVE                  HALL-FR-AGI-170
-- HV410  BALLOT_CHAIRMAN_INVALID                        HALL-FR-BAL-140
-- HV411  BALLOT_OPEN_QUESTION_FORBIDDEN                 HALL-FR-BAL-230
-- HV412  BALLOT_AFTER_MEETING_CLOSURE                   HALL-FR-BAL-280
--
-- Vote
-- HV501  VOTE_IMMUTABLE                                HALL-FR-VOT-060
-- HV502  VOTE_AFTER_BALLOT_COMPLETION                   HALL-FR-VOT-070
-- HV503  VOTE_MODE_MISMATCH                             HALL-FR-VOT-080
-- HV504  VOTE_PARTICIPATION_WRONG_BALLOT               HALL-FR-VOT-090
--
-- Missing referenced business objects detected by lifecycle triggers
-- HV901  UNKNOWN_COUNCIL_MEETING
-- HV902  UNKNOWN_BALLOT
-- HV903  UNKNOWN_MEETING_ATTENDANCE
-- HV904  UNKNOWN_COUNCIL_AGENDA_ITEM
-- HV905  UNKNOWN_COUNCIL_BUSINESS

-- HV125  MEETING_SNAPSHOT_IS_IMMUTABLE
-- HV230  AGENDA_ADJOURNMENT_IS_INVALID
-- HV701  MINUTES_HISTORY_CANNOT_BE_DELETED
-- HV702  MINUTES_REQUIRES_CLOSING_SNAPSHOT
-- HV703  MINUTES_FACTS_ARE_IMMUTABLE
-- HV704  GENERATED_MINUTES_IS_FROZEN
-- HV705  GENERATED_DOCUMENT_IS_IMMUTABLE
-- HV706  MINUTES_REQUIRES_PDF_CONTENT
-- HV707  UNKNOWN_MINUTES
-- HV708  MINUTES_VERSION_CONFLICT
-- HV709  MINUTES_APPROVAL_REQUIRES_GENERATED_DOCUMENT
-- HV710  MINUTES_SECTIONS_CANNOT_BE_REMOVED
-- HV711  MINUTES_SECTION_IDENTITY_IS_IMMUTABLE
-- HV712  UNKNOWN_MINUTES_SECTION

-- HV231  AGENDA_ITEM_RECUSAL_IMMUTABLE                   HALL-FR-AGI-370
-- HV232  AGENDA_ITEM_RECUSAL_TOO_LATE                    HALL-FR-AGI-370
-- HV233  AGENDA_ITEM_RECUSAL_MEMBER_NOT_DECLARED         HALL-FR-AGI-370
-- HV305  RECUSED_MEMBER_CANNOT_PARTICIPATE               HALL-FR-BAL-310
-- HV234  RECUSAL_OCCURRENCE_MEETING_IS_IMMUTABLE          HALL-FR-AGI-370

-- HV131 attendance observations are immutable.

-- HV132 attendance movements require an ongoing meeting.

-- HV133 membership observations must follow the recorded chronology.

-- HV134 current powers require a known holder and unique written evidence.

-- HV135 membership observations are immutable.

-- HV136 a closed meeting cannot receive membership observations.

-- HV137 membership requires distinct known mandates of one council term.

-- HV140 a confirmed nominal membership record is required.

-- HV141 every confirmed member requires an explicit attendance declaration.

-- HV142 the affair cannot enter discussion without the applicable quorum.

-- HV143 a declaration cannot be observed in the future.

-- HV144 renewed convocation requires a recorded quorum failure and valid notice.

-- HV145 quorum observations are immutable.

-- HV146 renewed convocation evidence is immutable.

-- HV147 renewed convocation requires three clear calendar days after sending.

-- HV148 the exemption is limited to identified unfinished affairs from the failed meeting.

-- HV149 the renewed meeting requires fresh membership and attendance observations.

-- HV414 a ballot requires a recorded discussion quorum.

-- HV416 only the ordinary-majority decision procedure is supported.

-- HV417 ballot completion cannot precede discussion.

-- HV418 the ballot is already definitively confirmed.

-- HV420 secret totals must account for every declared participation.

-- HV421 unknown ballot result preview.

-- HV422 the candidate or meeting context changed; review a new result preview.

-- HV423 definitive confirmation requires a reviewed result preview.

-- HV424 the stored vote does not match the reviewed candidate.

-- HV425 result previews are immutable evidence.

-- HV510 non-participation records are immutable.

-- HV511 non-participation must match an open ballot.

-- HV512 a public participant cannot both express a vote and not participate.

-- HV513 a public voter or proxy holder must still be eligible when expressing the vote.

-- HV514 secret accounting requires explicit nonnegative totals.

-- Meeting preparation documents
-- HV801  FROZEN_AGENDA_COMPOSITION_CHANGE                  HALL-FR-NOT-020
-- HV802  PREPARATION_HISTORY_IMMUTABLE                     HALL-FR-NOT-030
-- HV803  AGENDA_FREEZE_UNAVAILABLE                         HALL-FR-NOT-040
-- HV804  NOTICE_GENERATION_UNAVAILABLE                     HALL-FR-NOT-060
-- HV805  NOTICE_RENDERED_FACTS_STALE                       HALL-TR-NOT-010
-- HV806  NOTICE_PDF_REQUIRED                               HALL-FR-NOT-070
-- HV807  MEETING_CURRENT_NOTICE_REQUIRED                   HALL-FR-NOT-090
-- HV808  AGENDA_REOPENING_UNAVAILABLE                       HALL-FR-NOT-100
-- HV809  PREPARED_SUBJECT_IDENTITY_IMMUTABLE                HALL-FR-BUS-050
-- HV810  PREPARED_SUBJECT_INSCRIPTION_UNAVAILABLE            HALL-FR-AGI-380
-- HV910  PREPARED_SUBJECT_NOT_FOUND                          diagnostic

-- HV235: an in-meeting open question addition or its chronology is invalid; its evidence is immutable.

-- HV730: confirmed decision facts are immutable.
-- HV731: a confirmed proposal requires its submitted text.

-- HV732 decision history cannot be removed.
-- HV733 decision origin is immutable.
-- HV734 frozen decision cannot change.
-- HV735 retained decision PDF is immutable.
-- HV736 retained decision document requires PDF bytes.
-- HV737 unknown council decision.
-- HV738 decision version conflict.

-- HV742 decision recovery requires complete matching retained evidence.
-- HV743 decision number candidate changed before freeze.

-- HV126  PREVIOUS_MINUTES_APPROVAL_REQUIRED
