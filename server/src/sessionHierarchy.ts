import { Project, SessionType, Topic } from "./types";

export function deriveSessionHierarchy(
  payload: { type: SessionType; topicId?: string | null; projectId?: string | null; goalId?: string | null; topicName?: string | null },
  topics: Topic[],
  projects: Project[]
) {
  if (payload.type === "focus" && !payload.topicId) {
    throw new Error("Focus sessions require topicId");
  }

  if (payload.type === "focus" && !payload.topicId && (payload.projectId || payload.goalId)) {
    throw new Error("Focus sessions cannot use projectId/goalId without topicId");
  }

  if (!payload.topicId) {
    return { topicId: null, topicName: payload.topicName ?? null, projectId: null, goalId: null };
  }

  const topic = topics.find((entry) => entry.id === payload.topicId);
  if (!topic || topic.archived) {
    throw new Error("topicId does not exist");
  }

  const project = projects.find((entry) => entry.id === topic.projectId && !entry.archived);
  if (!project) {
    throw new Error("topic project does not exist");
  }

  return { topicId: topic.id, topicName: topic.name, projectId: project.id, goalId: project.goalId };
}
