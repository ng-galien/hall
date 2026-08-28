import type { HallSettings } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { HallSettingsRepository, UpdateHallSettings } from "./contracts.js";
import { asNullableString, type DatabaseRow } from "./row.js";

function mapHallSettings(row: DatabaseRow): HallSettings {
  return {
    name: String(row.name),
    inseeCode: asNullableString(row.insee_code),
    siren: asNullableString(row.siren),
    population: row.population == null ? null : Number(row.population),
    populationReferenceDate: asNullableString(row.population_reference_date),
    addressLine1: String(row.address_line_1),
    addressLine2: String(row.address_line_2),
    postalCode: String(row.postal_code),
    city: String(row.city),
    phone: String(row.phone),
    email: asNullableString(row.email),
    website: asNullableString(row.website),
    defaultMeetingLocation: String(row.default_meeting_location),
    timeZone: String(row.time_zone),
    outboundEmailSenderName: String(row.outbound_email_sender_name),
    outboundEmailSenderAddress: asNullableString(row.outbound_email_sender_address),
    outboundEmailReplyToAddress: asNullableString(row.outbound_email_reply_to_address),
    updatedAt: asNullableString(row.updated_at),
  };
}

export function createHallSettingsRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): HallSettingsRepository {
  const get = async () => {
    const row = await sqlExecutor.get("settings.get");
    if (!row) throw new Error("Hall settings singleton is missing");
    return mapHallSettings(row);
  };
  return {
    get,
    async update(input: UpdateHallSettings) {
      const result = await sqlExecutor.run("settings.update", {
        ...input,
        updatedAt: new Date().toISOString(),
      });
      if (result.changes !== 1) throw new Error("Hall settings singleton is missing");
      return get();
    },
  };
}
