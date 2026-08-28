import type { AgendaItem, Topic, TopicDetails, TopicState } from "@hall/domain";
import { apiRequest, apiSirenRequest, submitSirenActionAt } from "./apiClient";

export interface TopicFilters {
  state?: TopicState;
  folderPath?: string;
  resourceId?: string;
}

const topicQuery = (filters: TopicFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.state) params.set("state", filters.state);
  if (filters.folderPath !== undefined) params.set("folderPath", filters.folderPath);
  if (filters.resourceId) params.set("resourceId", filters.resourceId);
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const listTopics = (filters?: TopicFilters) => apiRequest<Topic[]>(`/topics${topicQuery(filters)}`);
export const getTopicDetails = (topicId: string) => apiRequest<TopicDetails>(`/topics/${topicId}`);
export const getTopicDetailsSiren = (topicId: string) => apiSirenRequest<TopicDetails>(`/topics/${topicId}`);
export const createTopic = (input: Record<string, unknown>) =>
  submitSirenActionAt<Topic>("/topics", "topic.create", input).then((result) => result.data);
export const updateTopic = (topicId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<Topic>(`/topics/${topicId}`, "topic.update", input).then((result) => result.data);
export const reclassifyTopic = (topicId: string, folderPath: string) =>
  submitSirenActionAt<Topic>(`/topics/${topicId}`, "topic.reclassify", { folderPath }).then((result) => result.data);
export const scheduleTopic = (topicId: string, meetingId: string, position: number) =>
  submitSirenActionAt<AgendaItem>(`/topics/${topicId}`, "topic.schedule", { meetingId, position }).then(
    (result) => result.data,
  );
export const attachTopicDecision = (topicId: string, draftText: string) =>
  submitSirenActionAt<Topic>(`/topics/${topicId}`, "topic.attach-decision", { draftText }).then(
    (result) => result.data,
  );
export const detachTopicDecision = (topicId: string) =>
  submitSirenActionAt<Topic>(`/topics/${topicId}`, "topic.detach-decision").then((result) => result.data);
