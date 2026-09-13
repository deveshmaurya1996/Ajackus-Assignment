import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getToken } from "@/lib/api-client";
import { Header } from "@/components/Header";
import { StatusColumn } from "@/components/StatusColumn";
import { TaskDetail } from "@/components/TaskDetail";
import {
  useCreateTask,
  useExportTasks,
  useProject,
  useProjectActivity,
} from "@/hooks/useProject";
import type { ApiTask, TaskStatus } from "@/types";
import { STATUS_ORDER, formatActivity } from "@/types";

export default function ProjectPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [activeTask, setActiveTask] = useState<ApiTask | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newColumn, setNewColumn] = useState<TaskStatus>("todo");
  const [error, setError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) navigate("/login", { replace: true });
  }, [navigate]);

  const { data, isLoading, error: queryError } = useProject(id);
  const { data: activityData } = useProjectActivity(id);

  const createTask = useCreateTask(id, {
    onSuccess: () => setNewTitle(""),
    onError: (message) => setError(message),
  });

  const exportTasks = useExportTasks(id, {
    onSuccess: (res) =>
      setExportMsg(
        `exported ${res.exported} (created ${res.created}, updated ${res.updated}, failed ${res.failed})`,
      ),
    onError: (message) => setExportMsg(message),
  });

  const project = data?.project;
  const myRole = project?.myRole;
  const canEdit = myRole === "admin" || myRole === "member";

  const tasksByStatus: Record<TaskStatus, ApiTask[]> = {
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  };
  if (project) {
    for (const t of project.tasks) {
      tasksByStatus[t.status].push(t);
    }
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Link
          to="/dashboard"
          className="text-sm text-muted hover:text-white"
        >
          ← all projects
        </Link>

        {isLoading && <p className="text-muted text-sm mt-6">loading…</p>}
        {queryError && (
          <p className="text-sm text-red-400 mt-6">
            {queryError instanceof Error ? queryError.message : "failed to load"}
          </p>
        )}

        {project && (
          <>
            <div className="flex items-start justify-between mt-4 mb-8 gap-4">
              <div>
                <h1 className="text-2xl font-semibold">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-muted mt-1 max-w-2xl">
                    {project.description}
                  </p>
                )}
                <p className="text-xs text-muted mt-2">
                  owner: {project.owner.name} · {project.memberships.length} members
                  {myRole ? ` · you: ${myRole}` : ""}
                </p>
              </div>
              {canEdit && (
                <div className="shrink-0 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setExportMsg(null);
                      exportTasks.mutate();
                    }}
                    disabled={exportTasks.isPending}
                    className="bg-accent hover:bg-indigo-500 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
                  >
                    {exportTasks.isPending ? "exporting…" : "export to Airtable"}
                  </button>
                  {exportMsg && (
                    <p className="text-xs text-muted mt-2 max-w-xs">{exportMsg}</p>
                  )}
                </div>
              )}
            </div>

            {canEdit && (
              <section className="bg-surface border border-border rounded-lg p-4 mb-6">
                <h2 className="text-sm font-medium mb-3">add a task</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newTitle.trim()) return;
                    setError(null);
                    createTask.mutate({ title: newTitle.trim(), status: newColumn });
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="task title"
                    className="flex-1 rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                  <select
                    value={newColumn}
                    onChange={(e) => setNewColumn(e.target.value as TaskStatus)}
                    className="rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={createTask.isPending}
                    className="bg-accent hover:bg-indigo-500 text-white text-sm font-medium rounded-md px-4 disabled:opacity-50"
                  >
                    add
                  </button>
                </form>
                {error && (
                  <p className="text-sm text-red-400 mt-2" role="alert">
                    {error}
                  </p>
                )}
              </section>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {STATUS_ORDER.map((s) => (
                <StatusColumn
                  key={s}
                  status={s}
                  tasks={tasksByStatus[s]}
                  onTaskClick={setActiveTask}
                />
              ))}
            </div>

            <section className="mt-10">
              <h2 className="text-sm font-medium mb-3">recent activity</h2>
              <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
                {(activityData?.activities ?? []).length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted">no activity yet</li>
                )}
                {(activityData?.activities ?? []).map((a) => (
                  <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                    <span>{formatActivity(a)}</span>
                    <span className="text-xs text-muted shrink-0">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10">
              <h2 className="text-sm font-medium mb-3">members</h2>
              <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
                {project.memberships.map((m) => (
                  <li
                    key={m.id}
                    className="px-4 py-3 flex items-center justify-between text-sm"
                  >
                    <span>{m.user.name}</span>
                    <span className="text-xs text-muted">
                      {m.user.email} · {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>

      {activeTask && project && (
        <TaskDetail
          task={activeTask}
          projectId={id!}
          members={project.memberships}
          myRole={myRole}
          onClose={() => setActiveTask(null)}
        />
      )}
    </div>
  );
}
