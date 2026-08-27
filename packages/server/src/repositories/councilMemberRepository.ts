import { randomUUID } from "node:crypto";
import type { CouncilMember } from "@mairie/domain";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";
import type { CouncilMemberRepository } from "./contracts.js";
import { asBoolean, asNullableString, type DatabaseRow } from "./row.js";

const mapMember = (row: DatabaseRow): CouncilMember => ({
  id: String(row.id),
  firstName: String(row.first_name),
  lastName: String(row.last_name),
  email: asNullableString(row.email),
  role: row.role as CouncilMember["role"],
  active: asBoolean(row.active),
  termStartedOn: String(row.term_started_on),
  termEndedOn: asNullableString(row.term_ended_on),
});

export function createCouncilMemberRepository({
  sqliteExecutor,
}: {
  sqliteExecutor: SqliteExecutor;
}): CouncilMemberRepository {
  return {
    list() {
      return sqliteExecutor.run((database) =>
        database
          .prepare("SELECT * FROM council_members ORDER BY active DESC, role, last_name, first_name")
          .all()
          .map(mapMember),
      );
    },
    listActive() {
      return sqliteExecutor.run((database) =>
        database
          .prepare("SELECT * FROM council_members WHERE active = 1 ORDER BY role, last_name, first_name")
          .all()
          .map(mapMember),
      );
    },
    find(id) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare("SELECT * FROM council_members WHERE id = ?").get(id);
        return row ? mapMember(row) : null;
      });
    },
    create(input) {
      return sqliteExecutor.run((database) => {
        const id = randomUUID();
        database
          .prepare(`INSERT INTO council_members
            (id, first_name, last_name, email, role, term_started_on)
            VALUES (?, ?, ?, ?, ?, ?)`)
          .run(id, input.firstName, input.lastName, input.email ?? null, input.role, input.termStartedOn);
        return mapMember(database.prepare("SELECT * FROM council_members WHERE id = ?").get(id)!);
      });
    },
  };
}
