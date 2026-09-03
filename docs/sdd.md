# vote

```yaml
choice: approve | reject | abstain | none

ballot:
  - id
  - question
  - completed-at:
    - null on insert
    - change forbidden if not null
  - qorum:
    - must be greater than 0
  - choice:
    - null initially
    - change forbidden if not null
  - constraints:
    - completed-at is null = choice is null
  - trigger: |
    when completed-at change
       get the choice count for the ballot from the vote table
       if the choice count meets > qorum
            update the choice with the greatest count of choice, chairman count twice
        else
            set the choice to none

vote:
  - choice
  - person
  - chairman
  - count:
    - must be greater than 0
    - equal to 1 if person is not null
  - ballot
  - constraints:
    - (person, ballot) must be unique
    - (choice, ballot) must be unique if person is null

```
