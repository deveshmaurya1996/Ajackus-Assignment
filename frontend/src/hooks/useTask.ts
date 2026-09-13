import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ApiComment, ApiTask } from "@/types";
import { queryKeys } from "./queryKeys";

type MutationCallbacks = {
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function useTaskComments(taskId: string) {
  return useQuery({
    queryKey: queryKeys.comments(taskId),
    queryFn: () => apiFetch<{ comments: ApiComment[] }>(`/api/tasks/${taskId}/comments`),
  });
}

export function useUpdateTask(
  taskId: string,
  projectId: string,
  options: MutationCallbacks = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<{ task: ApiTask }>(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.activity(projectId) });
      options.onSuccess?.();
    },
    onError: (err) =>
      options.onError?.(err instanceof Error ? err.message : "save failed"),
  });
}

export function useDeleteTask(
  taskId: string,
  projectId: string,
  options: MutationCallbacks = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>(`/api/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.activity(projectId) });
      options.onSuccess?.();
    },
    onError: (err) =>
      options.onError?.(err instanceof Error ? err.message : "delete failed"),
  });
}

export function usePostComment(
  taskId: string,
  projectId: string,
  options: MutationCallbacks = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<{ comment: ApiComment }>(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.comments(taskId) });
      qc.invalidateQueries({ queryKey: queryKeys.activity(projectId) });
      options.onSuccess?.();
    },
    onError: (err) =>
      options.onError?.(err instanceof Error ? err.message : "comment failed"),
  });
}
