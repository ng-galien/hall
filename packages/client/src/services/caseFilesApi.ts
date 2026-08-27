import type { CaseFile } from "@mairie/domain";
import { apiRequest } from "./apiClient";

export const listCaseFiles = () => apiRequest<CaseFile[]>("/case-files");
export const createCaseFile = (input: Record<string, unknown>) =>
  apiRequest<CaseFile>("/case-files", { method: "POST", body: JSON.stringify(input) });
