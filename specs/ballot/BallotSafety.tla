---------------------------- MODULE BallotSafety ----------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS Keys, Fingerprints, Targets, Results

ASSUME /\ Keys # {}
       /\ Fingerprints # {}
       /\ Targets # {}
       /\ Results = {"adopted", "rejected"}

VARIABLES records, decisionStatus

vars == <<records, decisionStatus>>

ActiveRecords == {record \in records : ~record.cancelled}

Init ==
  /\ records = {}
  /\ decisionStatus = [target \in Targets |-> "scheduled"]

Record(key, fingerprint, target, result) ==
  /\ ~\E record \in records : record.key = key
  /\ ~\E record \in ActiveRecords : record.target = target
  /\ records' = records \cup {
       [key |-> key,
        fingerprint |-> fingerprint,
        target |-> target,
        result |-> result,
        cancelled |-> FALSE]
     }
  /\ decisionStatus' = [decisionStatus EXCEPT ![target] = result]

Replay(key, fingerprint, target, result) ==
  /\ \E record \in records :
       /\ record.key = key
       /\ record.fingerprint = fingerprint
       /\ record.target = target
       /\ record.result = result
  /\ UNCHANGED vars

Conflict(key, fingerprint, target, result) ==
  /\ \/ \E record \in records :
            /\ record.key = key
            /\ \/ record.fingerprint # fingerprint
               \/ record.target # target
               \/ record.result # result
     \/ \E record \in ActiveRecords : record.target = target
  /\ UNCHANGED vars

Cancel(key) ==
  \E record \in ActiveRecords :
    /\ record.key = key
    /\ records' = (records \ {record}) \cup {[record EXCEPT !.cancelled = TRUE]}
    /\ decisionStatus' = [decisionStatus EXCEPT ![record.target] = "scheduled"]

Next ==
  \/ \E key \in Keys, fingerprint \in Fingerprints, target \in Targets, result \in Results :
       Record(key, fingerprint, target, result)
  \/ \E key \in Keys, fingerprint \in Fingerprints, target \in Targets, result \in Results :
       Replay(key, fingerprint, target, result)
  \/ \E key \in Keys, fingerprint \in Fingerprints, target \in Targets, result \in Results :
       Conflict(key, fingerprint, target, result)
  \/ \E key \in Keys : Cancel(key)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ records \subseteq
       [key : Keys,
        fingerprint : Fingerprints,
        target : Targets,
        result : Results,
        cancelled : BOOLEAN]
  /\ decisionStatus \in [Targets -> Results \cup {"scheduled"}]

UniqueIdempotencyKeys ==
  \A left, right \in records : left.key = right.key => left = right

AtMostOneFinalBallotPerTarget ==
  \A left, right \in ActiveRecords : left.target = right.target => left = right

DecisionAndBallotAreAtomic ==
  /\ \A record \in ActiveRecords : decisionStatus[record.target] = record.result
  /\ \A target \in Targets :
       ~(\E record \in ActiveRecords : record.target = target)
         => decisionStatus[target] = "scheduled"

=============================================================================
