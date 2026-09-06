import type { HallSettings } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { HallSettingsRepository, UpdateHallSettings } from "./contracts.js";
import { asNullableInteger, asNullableNumber, asNullableString, asString, type DatabaseRow } from "./row.js";

function mapHallSettings(row: DatabaseRow): HallSettings {
  const longitude = asNullableNumber(row.geographic_longitude, "hall_settings.geographic_longitude");
  const latitude = asNullableNumber(row.geographic_latitude, "hall_settings.geographic_latitude");
  if ((longitude === null) !== (latitude === null)) {
    throw new Error("Invalid persisted hall_settings.geographic_position: longitude and latitude must be paired");
  }
  return {
    name: asString(row.name, "hall_settings.name"),
    inseeCode: asNullableString(row.insee_code, "hall_settings.insee_code"),
    siren: asNullableString(row.siren, "hall_settings.siren"),
    population: asNullableInteger(row.population, "hall_settings.population"),
    populationReferenceDate: asNullableString(row.population_reference_date, "hall_settings.population_reference_date"),
    addressLine1: asString(row.address_line_1, "hall_settings.address_line_1"),
    addressLine2: asString(row.address_line_2, "hall_settings.address_line_2"),
    postalCode: asString(row.postal_code, "hall_settings.postal_code"),
    city: asString(row.city, "hall_settings.city"),
    geographicPosition: longitude === null || latitude === null ? null : [longitude, latitude],
    phone: asString(row.phone, "hall_settings.phone"),
    email: asNullableString(row.email, "hall_settings.email"),
    website: asNullableString(row.website, "hall_settings.website"),
    defaultMeetingLocation: asString(row.default_meeting_location, "hall_settings.default_meeting_location"),
    timeZone: asString(row.time_zone, "hall_settings.time_zone"),
    outboundEmailSenderName: asString(row.outbound_email_sender_name, "hall_settings.outbound_email_sender_name"),
    outboundEmailSenderAddress: asNullableString(
      row.outbound_email_sender_address,
      "hall_settings.outbound_email_sender_address",
    ),
    outboundEmailReplyToAddress: asNullableString(
      row.outbound_email_reply_to_address,
      "hall_settings.outbound_email_reply_to_address",
    ),
    updatedAt: asNullableString(row.updated_at, "hall_settings.updated_at"),
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
      const { geographicPosition, ...settings } = input;
      return sqlExecutor.execute(async () => {
        const result = await sqlExecutor.run("settings.update", {
          ...settings,
          geographicLongitude: geographicPosition?.[0] ?? null,
          geographicLatitude: geographicPosition?.[1] ?? null,
          updatedAt: new Date().toISOString(),
        });
        if (result.changes !== 1) throw new Error("Hall settings singleton is missing");
        return get();
      });
    },
  };
}
