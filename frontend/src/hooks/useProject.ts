import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ApiActivity, ApiProjectDetail, ApiTask, TaskStatus } from "@/types";
import { queryKeys } from "./queryKeys";

type CreateTaskOptions = {
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

type ExportTasksOptions = {
  onSuccess?: (res: {
    exported: number;
    created: number;
    updated: number;
    failed: number;
  }) => void;
  onError?: (message: string) => void;
};

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => apiFetch<{ project: ApiProjectDetail }>(`/api/projects/${id}`),
    enabled: !!id,
  });
}

export function useProjectActivity(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.activity(id),
    queryFn: () => apiFetch<{ activities: ApiActivity[] }>(`/api/projects/${id}/activity`),
    enabled: !!id,
  });
}

export function useCreateTask(projectId: string | undefined, options: CreateTaskOptions = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; status: TaskStatus }) =>
      apiFetch<{ task: ApiTask }>(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.activity(projectId) });
      options.onSuccess?.();
    },
    onError: (err) =>
      options.onError?.(err instanceof Error ? err.message : "create failed"),
  });
}

export function useExportTasks(projectId: string | undefined, options: ExportTasksOptions = {}) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{
        exported: number;
        created: number;
        updated: number;
        failed: number;
      }>(`/api/projects/${projectId}/export`, { method: "POST" }),
    onSuccess: (res) => options.onSuccess?.(res),
    onError: (err) =>
      options.onError?.(err instanceof Error ? err.message : "export failed"),
  });
}
