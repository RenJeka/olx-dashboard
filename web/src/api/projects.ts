import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './base';
import type { Project, Search } from '../types';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/api/projects'),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<Project>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: number; name: string }) =>
      api<Project>(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: number) =>
      api<{ deleted: boolean }>(`/api/projects/${projectId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      // Видалення проекту відв'язує пошуки → список пошуків теж міг змінитись.
      qc.invalidateQueries({ queryKey: ['searches'] });
    },
  });
}

export function useReorderProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, direction }: { projectId: number; direction: 'up' | 'down' }) =>
      api<Project>(`/api/projects/${projectId}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

/** Призначення пошуку до проекту (або відв'язування при projectId=null). */
export function useAssignSearchToProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, projectId }: { searchId: number; projectId: number | null }) =>
      api<Search>(`/api/searches/${searchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ project_id: projectId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searches'] }),
  });
}
