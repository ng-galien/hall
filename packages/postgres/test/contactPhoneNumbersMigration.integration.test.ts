import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

const migration = readFile(new URL("../sql/migrations/009-contact-phone-numbers.sql", import.meta.url), "utf8");

/** Former telephone texts as people typed them, with the organization and notes of their contact. */
const formerContacts = [
  { name: "Two numbers", organization: "Syndicat des eaux", phone: "03 84 87 42 31 / 07 86 29 55 76", notes: "" },
  { name: "Two mobiles", organization: null, phone: "06.12.34.56.78 ou 06 98 76 54 32", notes: "" },
  { name: "Unreadable", organization: null, phone: "voir le secrétariat", notes: "Rencontré en mai." },
  { name: "Foreign", organization: null, phone: "+41 22 123 45 67", notes: "" },
  {
    name: "Three lines",
    organization: "Préfecture",
    phone: "01 23 45 67 89; 01 98 76 54 32\n+33 6 11 22 33 44, 06 11 22 33 44",
    notes: "",
  },
  { name: "Without number", organization: null, phone: null, notes: "" },
];

// @verifies-requirement HALL-FR-DIR-170
postgresDescribe("migration 009 of the contact telephone numbers", () => {
  const pool = createTestPool();
  useFreshHallDatabase(pool);

  it("copies each readable number to its slot, carries the rest to the notes, keeps the former column and runs once", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const contact of formerContacts) {
        await client.query(
          "INSERT INTO hall.contact (first_name, last_name, organization_name, phone, notes) VALUES ('Contact', $1, $2, $3, $4)",
          [contact.name, contact.organization, contact.phone, contact.notes],
        );
      }
      await client.query(await migration);
      const copied = await client.query(
        `SELECT last_name, phone, mobile_phone, personal_phone, professional_phone, notes
         FROM hall.contact ORDER BY last_name`,
      );
      await client.query("DELETE FROM hall_meta.data_migration WHERE name = 'contact-phone-numbers'");
      await client.query(await migration);
      await client.query(await migration);
      const replayed = await client.query(
        `SELECT last_name, phone, mobile_phone, personal_phone, professional_phone, notes
         FROM hall.contact ORDER BY last_name`,
      );

      expect(copied.rows).toEqual([
        {
          last_name: "Foreign",
          phone: "+41 22 123 45 67",
          mobile_phone: null,
          personal_phone: "+41221234567",
          professional_phone: null,
          notes: "",
        },
        {
          last_name: "Three lines",
          phone: "01 23 45 67 89; 01 98 76 54 32\n+33 6 11 22 33 44, 06 11 22 33 44",
          mobile_phone: "+33611223344",
          personal_phone: null,
          professional_phone: "+33123456789",
          notes: "Téléphone repris : 01 98 76 54 32",
        },
        {
          last_name: "Two mobiles",
          phone: "06.12.34.56.78 ou 06 98 76 54 32",
          mobile_phone: "+33612345678",
          personal_phone: null,
          professional_phone: null,
          notes: "Téléphone repris : 06 98 76 54 32",
        },
        {
          last_name: "Two numbers",
          phone: "03 84 87 42 31 / 07 86 29 55 76",
          mobile_phone: "+33786295576",
          personal_phone: null,
          professional_phone: "+33384874231",
          notes: "",
        },
        {
          last_name: "Unreadable",
          phone: "voir le secrétariat",
          mobile_phone: null,
          personal_phone: null,
          professional_phone: null,
          notes: "Rencontré en mai.\n\nTéléphone repris : voir le secrétariat",
        },
        {
          last_name: "Without number",
          phone: null,
          mobile_phone: null,
          personal_phone: null,
          professional_phone: null,
          notes: "",
        },
      ]);
      expect(replayed.rows).toEqual(copied.rows);
      expect(
        (
          await client.query(
            "SELECT count(*)::int AS runs FROM hall_meta.data_migration WHERE name = 'contact-phone-numbers'",
          )
        ).rows,
      ).toEqual([{ runs: 1 }]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
