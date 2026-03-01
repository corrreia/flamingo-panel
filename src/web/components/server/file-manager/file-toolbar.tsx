import { Button } from "@web/components/ui/button";
import { Archive, FolderPlus, Trash2, Upload } from "lucide-react";

interface FileToolbarProps {
  isCompressing: boolean;
  isDeleting: boolean;
  onCompress: () => void;
  onCreateDir: () => void;
  onDelete: () => void;
  onUploadClick: () => void;
  selectionCount: number;
}

export function FileToolbar({
  isCompressing,
  isDeleting,
  onCompress,
  onCreateDir,
  onDelete,
  onUploadClick,
  selectionCount,
}: FileToolbarProps) {
  if (selectionCount > 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {selectionCount} selected
        </span>
        <Button
          disabled={isDeleting}
          onClick={onDelete}
          size="sm"
          variant="destructive"
        >
          <Trash2 />
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
        <Button
          disabled={isCompressing}
          onClick={onCompress}
          size="sm"
          variant="outline"
        >
          <Archive />
          {isCompressing ? "Compressing..." : "Compress"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={onCreateDir} size="sm" variant="outline">
        <FolderPlus />
        New Folder
      </Button>
      <Button onClick={onUploadClick} size="sm" variant="outline">
        <Upload />
        Upload
      </Button>
    </div>
  );
}
