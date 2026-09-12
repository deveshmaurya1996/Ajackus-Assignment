import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getStoredUser } from "@/lib/api-client";
import type { ApiTask, ApiProjectMember, TaskStatus, Role, ApiComment } from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/types";

type Props = {
  task: ApiTask;
  projectId: string;
  members: ApiProjectMember[];
  myRole?: Role;
  onClose: () => void;
};

function resolveAssigneeId(task: ApiTask): string {
  return task.assigneeId ?? task.assignee_id ?? task.assignee?.id ?? "";
}

export function TaskDetail({ task, projectId, members, myRole, onClose }: Props) {
  const queryClient = useQueryClient();
  const me = getStoredUser();
  const role =
    myRole ??
    members.find((m) => m.user.id === me?.id)?.role ??
    "viewer";
  const canPost = role === "admin" || role === "member";

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [assigneeId, setAssigneeId] = useState<string>(resolveAssigneeId(task));
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: commentsData } = useQuery({
    queryKey: ["comments", task.id],
    queryFn: () => apiFetch<{ comments: ApiComment[] }>(`/api/tasks/${task.id}/comments`),
  });

  const updateTask = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<{ task: ApiTask }>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["activity", projectId] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "save failed"),
  });

  const deleteTask = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>(`/api/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["activity", projectId] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "delete failed"),
  });

  const postComment = useMutation({
    mutationFn: (body: string) =>
      apiFetch<{ comment: ApiComment }>(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setCommentBody("");
      queryClient.invalidateQueries({ queryKey: ["comments", task.id] });
      queryClient.invalidateQueries({ queryKey: ["activity", projectId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "comment failed"),
  });

  useEffect(() => {
    setAssigneeId(resolveAssigneeId(task));
  }, [task]);

  function onSave() {
    setError(null);
    updateTask.mutate({
      title,
      description,
      status,
      assigneeId: assigneeId || null,
    });
  }

  const comments = commentsData?.comments ?? [];

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface border border-border rounded-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">edit task</h2>
          <button onClick={onClose} className="text-muted hover:text-white">
            ✕
          </button>
        </div>

        <label className="block mb-3">
          <span className="text-xs text-muted">title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs text-muted">description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-xs text-muted">status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-muted">assignee</span>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="mb-4 border-t border-border pt-4">
          <h3 className="text-sm font-medium mb-3">comments</h3>
          <ul className="space-y-3 mb-3 max-h-48 overflow-y-auto">
            {comments.length === 0 && (
              <li className="text-xs text-muted">no comments yet</li>
            )}
            {comments.map((c) => (
              <li key={c.id} className="text-sm bg-bg border border-border rounded-md px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-xs">{c.author.name}</span>
                  <span className="text-[10px] text-muted">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
          {canPost ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!commentBody.trim()) return;
                setError(null);
                postComment.mutate(commentBody.trim());
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="add a comment"
                className="flex-1 rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={postComment.isPending}
                className="bg-accent hover:bg-indigo-500 text-white text-sm font-medium rounded-md px-3 disabled:opacity-50"
              >
                post
              </button>
            </form>
          ) : (
            <p className="text-xs text-muted">viewers can read comments but cannot post</p>
          )}
        </section>

        {error && (
          <p className="text-sm text-red-400 mb-3" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => deleteTask.mutate()}
            disabled={deleteTask.isPending || !canPost}
            className="text-sm text-red-400 hover:text-red-300 disabled:opacity-40"
          >
            delete task
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-md border border-border hover:border-muted"
            >
              cancel
            </button>
            <button
              onClick={onSave}
              disabled={updateTask.isPending || !canPost}
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {updateTask.isPending ? "saving…" : "save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
