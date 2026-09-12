export type Role = "admin" | "member" | "viewer";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export type ApiUser = {
  id: string;
  email: string;
  name: string;
};

export type ApiTask = {
  id: string;
  projectId?: string;
  project_id?: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigneeId?: string | null;
  assignee_id?: string | null;
  createdById?: string;
  created_by_id?: string;
  position: number;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  assignee?: ApiUser | null;
};

export type ApiProjectMember = {
  id: string;
  role: Role;
  user: ApiUser;
};

export type ApiProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  ownerId?: string;
  owner_id?: string;
  owner: ApiUser;
  memberships: ApiProjectMember[];
  tasks: ApiTask[];
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  myRole?: Role;
};

export type ApiComment = {
  id: string;
  taskId: string;
  body: string;
  author: ApiUser;
  createdAt: string;
};

export type ApiActivity = {
  id: string;
  projectId: string;
  taskId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  actor: ApiUser;
  createdAt: string;
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  done: "Done",
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "review", "done"];

export function formatActivity(a: ApiActivity): string {
  const who = a.actor.name;
  const title = typeof a.metadata?.title === "string" ? a.metadata.title : "a task";
  switch (a.action) {
    case "task.created":
      return `${who} created “${title}”`;
    case "task.status_changed":
      return `${who} moved “${title}” from ${a.metadata.from} → ${a.metadata.to}`;
    case "task.assignee_changed":
      return `${who} changed assignee on “${title}”`;
    case "comment.added":
      return `${who} commented on “${title}”`;
    default:
      return `${who} · ${a.action}`;
  }
}
