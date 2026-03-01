import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@web/components/ui/alert-dialog";
import { Button } from "@web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// RenameDialog
// ---------------------------------------------------------------------------

interface RenameDialogProps {
  currentName: string;
  isPending: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  open: boolean;
}

export function RenameDialog({
  currentName,
  isPending,
  onClose,
  onRename,
  open,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (open) {
      setName(currentName);
    }
  }, [open, currentName]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== currentName) {
      onRename(trimmed);
    }
  }

  return (
    <Dialog onOpenChange={(v) => !v && onClose()} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>Enter a new name for this file.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="rename-input">Name</Label>
            <Input
              autoFocus
              id="rename-input"
              onChange={(e) => setName(e.target.value)}
              value={name}
            />
          </div>
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={
                isPending || !name.trim() || name.trim() === currentName
              }
              type="submit"
            >
              {isPending ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// CreateDirDialog
// ---------------------------------------------------------------------------

interface CreateDirDialogProps {
  isPending: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  open: boolean;
}

export function CreateDirDialog({
  isPending,
  onClose,
  onCreate,
  open,
}: CreateDirDialogProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onCreate(trimmed);
    }
  }

  return (
    <Dialog onOpenChange={(v) => !v && onClose()} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Directory</DialogTitle>
          <DialogDescription>
            Enter a name for the new directory.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="create-dir-input">Name</Label>
            <Input
              autoFocus
              id="create-dir-input"
              onChange={(e) => setName(e.target.value)}
              placeholder="my-folder"
              value={name}
            />
          </div>
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isPending || !name.trim()} type="submit">
              {isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// DeleteConfirmDialog
// ---------------------------------------------------------------------------

interface DeleteConfirmDialogProps {
  fileNames: string[];
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}

export function DeleteConfirmDialog({
  fileNames,
  isPending,
  onClose,
  onConfirm,
  open,
}: DeleteConfirmDialogProps) {
  const count = fileNames.length;
  const title = count === 1 ? "Delete file?" : `Delete ${count} files?`;

  const description =
    count <= 3
      ? `This will permanently delete ${fileNames.join(", ")}.`
      : `This will permanently delete ${count} items.`;

  return (
    <AlertDialog onOpenChange={(v) => !v && onClose()} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={onConfirm}
            variant="destructive"
          >
            {isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
