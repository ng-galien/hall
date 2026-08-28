import { findSirenAction } from "@hall/api-contract";
import type { Topic } from "@hall/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../services/apiClient";
import { createTopic, listTopics, updateTopic } from "../services/topicsApi";

interface TopicsState {
  topics: Topic[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  updatableIds: string[];
  load(): Promise<void>;
  create(input: Record<string, unknown>): Promise<Topic | null>;
  update(topicId: string, input: Record<string, unknown>): Promise<boolean>;
}

export const useTopicsStore = create<TopicsState>((set, get) => ({
  topics: [],
  loading: false,
  error: null,
  canCreate: false,
  updatableIds: [],
  async load() {
    set({ loading: true, error: null });
    try {
      const topics = await listTopics();
      const representation = await sirenRepresentation("/topics");
      const updatableIds = (representation.entities ?? []).flatMap((entity) =>
        "properties" in entity &&
        entity.properties &&
        typeof entity.properties.id === "string" &&
        findSirenAction(entity, "topic.reclassify")
          ? [entity.properties.id]
          : [],
      );
      set({
        topics,
        canCreate: Boolean(findSirenAction(representation, "topic.create")),
        updatableIds,
        loading: false,
      });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async create(input) {
    set({ error: null });
    try {
      const topic = await createTopic(input);
      await get().load();
      return topic;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async update(topicId, input) {
    set({ error: null });
    try {
      await updateTopic(topicId, input);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
