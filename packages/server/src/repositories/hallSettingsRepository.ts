import type { HallSettings } from "@hall/domain";
import type { PostgresClient } from "@hall/postgres";
import { z } from "zod";
import { administrationCall, administrationRequest } from "../infrastructure/postgres/administrationRequest.js";
import type { RequestContextStore } from "../security/requestContext.js";
import type { HallSettingsRepository, UpdateHallSettings } from "./contracts.js";
import { asNullableInteger, asNullableNumber, asNullableString, asString, type DatabaseRow } from "./row.js";

function mapHallSettings(row: DatabaseRow, meetingLocations: string[]): HallSettings {
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
    meetingLocations,
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
    outboundEmailSignatureMarkdown: asString(
      row.outbound_email_signature_markdown,
      "hall_settings.outbound_email_signature_markdown",
    ),
    outboundEmailFooterMarkdown: asString(
      row.outbound_email_footer_markdown,
      "hall_settings.outbound_email_footer_markdown",
    ),
    updatedAt: asNullableString(row.updated_at, "hall_settings.updated_at"),
  };
}

// @implements-requirement HALL-FR-CFG-030
export function createHallSettingsRepository({
  postgresClient,
  requestContext,
}: {
  postgresClient: PostgresClient;
  requestContext: RequestContextStore;
}): HallSettingsRepository {
  const administration = postgresClient.administration;
  const request = () => administrationRequest(requestContext);
  const mapped = (row: DatabaseRow | null) => {
    if (!row) throw new Error("Hall settings singleton is missing");
    return mapHallSettings(row, z.array(z.string()).parse(row.meeting_locations));
  };
  return {
    async get() {
      return mapped(await administrationCall(() => administration.hallSettings(request())));
    },
    async update(input: UpdateHallSettings) {
      const { geographicPosition, meetingLocations, ...settings } = input;
      return mapped(
        await administrationCall(() =>
          administration.updateHallSettings(
            request(),
            {
              ...settings,
              geographicLongitude: geographicPosition?.[0] ?? null,
              geographicLatitude: geographicPosition?.[1] ?? null,
            },
            meetingLocations,
          ),
        ),
      );
    },
  };
}
