export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string | undefined) => ["project", id] as const,
  activity: (id: string | undefined) => ["activity", id] as const,
  comments: (taskId: string) => ["comments", taskId] as const,
};
