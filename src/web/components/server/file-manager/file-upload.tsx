import { Badge } from "@web/components/ui/badge";
import { Loader2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface UploadItem {
  file: File;
  progress: "pending" | "uploading" | "done" | "error";
}

interface FileUploadProps {
  children: React.ReactNode;
  currentDir: string;
  onUploadComplete: () => void;
  serverId: string;
  uploadRef: React.RefObject<HTMLInputElement | null>;
}

function buildFilePath(currentDir: string, fileName: string): string {
  return currentDir === "/" ? `/${fileName}` : `${currentDir}/${fileName}`;
}

async function uploadFiles(
  files: File[],
  serverId: string,
  currentDir: string,
  setUploads: React.Dispatch<React.SetStateAction<UploadItem[]>>,
  onUploadComplete: () => void
) {
  for (let i = 0; i < files.length; i++) {
    setUploads((prev) =>
      prev.map((item, idx) =>
        idx === i ? { ...item, progress: "uploading" } : item
      )
    );

    const path = buildFilePath(currentDir, files[i].name);

    try {
      const res = await fetch(
        `/api/servers/${serverId}/files/write?file=${encodeURIComponent(path)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          credentials: "include",
          body: files[i],
        }
      );

      setUploads((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, progress: res.ok ? "done" : "error" } : item
        )
      );
    } catch {
      setUploads((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, progress: "error" } : item
        )
      );
    }
  }

  onUploadComplete();
  setTimeout(() => setUploads([]), 2000);
}

export function FileUpload({
  children,
  currentDir,
  onUploadComplete,
  serverId,
  uploadRef,
}: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const dragCounter = useRef(0);

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      if (files.length === 0) {
        return;
      }

      const items: UploadItem[] = files.map((file) => ({
        file,
        progress: "pending",
      }));
      setUploads(items);
      uploadFiles(files, serverId, currentDir, setUploads, onUploadComplete);
    },
    [serverId, currentDir, onUploadComplete]
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) {
      setDragging(true);
    }
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragging(false);

      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
      e.target.value = "";
    },
    [handleFiles]
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: file drop zone requires drag event handlers on wrapper div
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: file drop zone requires drag event handlers on wrapper div
    <div
      className="relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <input
        className="hidden"
        multiple
        onChange={onFileInputChange}
        ref={uploadRef}
        type="file"
      />

      {children}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-primary border-dashed bg-primary/5">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-8 w-8" />
            <p className="font-medium text-sm">Drop files to upload</p>
          </div>
        </div>
      )}

      {uploads.length > 0 && (
        <div className="mt-3 space-y-1">
          {uploads.map((item) => (
            <div
              className="flex items-center gap-2 text-sm"
              key={item.file.name}
            >
              {item.progress === "uploading" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              {item.progress === "pending" && <div className="h-3.5 w-3.5" />}
              <span className="min-w-0 truncate">{item.file.name}</span>
              {item.progress === "done" && (
                <Badge variant="secondary">Done</Badge>
              )}
              {item.progress === "error" && (
                <Badge variant="destructive">Failed</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
