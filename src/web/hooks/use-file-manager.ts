import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@web/lib/api";
import { useCallback, useState } from "react";

export interface FileEntry {
  directory: boolean;
  mime: string;
  modified: string;
  name: string;
  size: number;
}

const ARCHIVE_EXTENSIONS = new Set([
  ".tar.gz",
  ".tgz",
  ".zip",
  ".gz",
  ".rar",
  ".7z",
]);

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".log",
  ".cfg",
  ".conf",
  ".ini",
  ".yml",
  ".yaml",
  ".json",
  ".xml",
  ".properties",
  ".toml",
  ".env",
  ".sh",
  ".bash",
  ".bat",
  ".cmd",
  ".ps1",
  ".py",
  ".js",
  ".ts",
  ".lua",
  ".java",
  ".md",
  ".csv",
]);

export function isArchive(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".tar.gz")) {
    return true;
  }
  const ext = lower.substring(lower.lastIndexOf("."));
  return ARCHIVE_EXTENSIONS.has(ext);
}

export function isTextFile(name: string): boolean {
  const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

export function joinPath(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

export function useFileManager(serverId: string) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((name: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((names: string[]) => {
    setSelection(new Set(names));
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(new Set());
  }, []);

  const isAllSelected = useCallback(
    (names: string[]) => {
      if (names.length === 0) {
        return false;
      }
      return names.every((n) => selection.has(n));
    },
    [selection]
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["server-files", serverId] });
  }, [queryClient, serverId]);

  const deleteMutation = useMutation({
    mutationFn: (params: { root: string; files: string[] }) =>
      api.post(`/servers/${serverId}/files/delete`, params),
    onSuccess: () => {
      invalidate();
      clearSelection();
    },
  });

  const renameMutation = useMutation({
    mutationFn: (params: {
      root: string;
      files: { from: string; to: string }[];
    }) => api.put(`/servers/${serverId}/files/rename`, params),
    onSuccess: () => {
      invalidate();
    },
  });

  const copyMutation = useMutation({
    mutationFn: (params: { location: string }) =>
      api.post(`/servers/${serverId}/files/copy`, params),
    onSuccess: () => {
      invalidate();
    },
  });

  const createDirMutation = useMutation({
    mutationFn: (params: { name: string; path: string }) =>
      api.post(`/servers/${serverId}/files/create-directory`, params),
    onSuccess: () => {
      invalidate();
    },
  });

  const compressMutation = useMutation({
    mutationFn: (params: { root: string; files: string[] }) =>
      api.post(`/servers/${serverId}/files/compress`, params),
    onSuccess: () => {
      invalidate();
      clearSelection();
    },
  });

  const decompressMutation = useMutation({
    mutationFn: (params: { root: string; file: string }) =>
      api.post(`/servers/${serverId}/files/decompress`, params),
    onSuccess: () => {
      invalidate();
    },
  });

  return {
    selection,
    toggleSelect,
    selectAll,
    clearSelection,
    isAllSelected,
    invalidate,
    deleteMutation,
    renameMutation,
    copyMutation,
    createDirMutation,
    compressMutation,
    decompressMutation,
  };
}
