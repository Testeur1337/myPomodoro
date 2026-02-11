import assert from "assert";
import { migrateHierarchyData } from "../src/dataStore";
import { deriveSessionHierarchy } from "../src/sessionHierarchy";
import { Goal, Project, SessionRecord, Topic } from "../src/types";

const goal: Goal = { id: "g1", name: "Goal 1", createdAt: new Date().toISOString(), archived: false };
const project: Project = { id: "p1", goalId: goal.id, name: "Project 1", createdAt: new Date().toISOString(), archived: false };
const topic: Topic = { id: "t1", projectId: project.id, name: "Topic 1", color: "#22c55e", createdAt: new Date().toISOString(), archived: false };

assert.throws(() => deriveSessionHierarchy({ type: "focus", topicId: null }, [topic], [project]), /Focus sessions require topicId/);

const derived = deriveSessionHierarchy({ type: "focus", topicId: topic.id, projectId: "wrong", goalId: "wrong" }, [topic], [project]);
assert.equal(derived.projectId, project.id);
assert.equal(derived.goalId, goal.id);

const migrated = migrateHierarchyData({
  goals: [goal],
  projects: [{ ...project, goalId: "missing-goal" }],
  topics: [{ ...topic, projectId: "missing-project" }],
  sessions: [
    {
      id: "s1",
      type: "focus",
      topicId: null,
      topicName: null,
      goalId: null,
      projectId: null,
      note: null,
      rating: null,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationSeconds: 1200,
      createdAt: new Date().toISOString()
    } as SessionRecord
  ]
});

const migratedFocus = migrated.sessions.find((session) => session.id === "s1");
assert.ok(migratedFocus?.topicId, "focus session should be assigned topicId");
assert.ok(migratedFocus?.projectId, "focus session should have derived projectId");
assert.ok(migratedFocus?.goalId, "focus session should have derived goalId");

const updated = deriveSessionHierarchy({ type: "focus", topicId: migrated.topics[0].id }, migrated.topics, migrated.projects);
assert.equal(updated.projectId, migrated.topics[0].projectId);

console.log("Hierarchy checks passed");
