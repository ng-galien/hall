import { useEffect, useState } from "react";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { loadMeetingSettings } from "../services/hallSettingsApi";

export function useMeetingSettings() {
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof loadMeetingSettings>> | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  useEffect(() => {
    let active = true;
    void loadMeetingSettings()
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch((cause) => {
        if (active) setError(apiErrorCode(cause));
      });
    return () => {
      active = false;
    };
  }, []);
  return { settings, error };
}
