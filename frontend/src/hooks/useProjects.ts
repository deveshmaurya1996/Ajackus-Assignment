import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "./queryKeys";

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  role: "admin" | "member" | "viewer";
  owner: { id: string; name: string; email: string };
  taskCount: number;
  createdAt: string;
};

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => apiFetch<{ projects: ProjectSummary[] }>("/api/projects"),
  });
}
