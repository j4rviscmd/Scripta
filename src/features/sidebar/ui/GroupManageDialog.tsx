import { useCallback, useRef, useState } from "react";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { Group } from "@/features/groups";
import { toast } from "sonner";

interface GroupManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: Group[];
  onCreate: (name: string) => Promise<Group>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * Dialog for creating, renaming, and deleting note groups.
 */
export function GroupManageDialog({
  open,
  onOpenChange,
  groups,
  onCreate,
  onRename,
  onDelete,
}: GroupManageDialogProps) {
  const [newGroupName, setNewGroupName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const composingRef = useRef(false);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    // Delay reset: in Chromium compositionend fires *before* the keydown
    // for the Enter that confirms the composition, so the ref must stay
    // true long enough for the subsequent keydown handler to see it.
    setTimeout(() => {
      composingRef.current = false;
    }, 50);
  }, []);

  const handleCreate = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      await onCreate(name);
      setNewGroupName("");
    } catch {
      toast.error("Failed to create group");
    }
  };

  const handleRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      await onRename(id, name);
      setEditingId(null);
    } catch {
      toast.error("Failed to rename group");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete group");
    }
  };

  const startEditing = (group: Group) => {
    setEditingId(group.id);
    setEditingName(group.name);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Groups</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add group input */}
            <div className="flex gap-2">
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !composingRef.current) handleCreate();
                }}
                placeholder="New group name..."
                className="flex-1"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={handleCreate}
                disabled={!newGroupName.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {groups.length > 0 && <Separator />}

            {/* Group list */}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  {editingId === group.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onCompositionStart={handleCompositionStart}
                        onCompositionEnd={handleCompositionEnd}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !composingRef.current) handleRename(group.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-7 flex-1 text-sm"
                        autoFocus
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleRename(group.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm">
                        {group.name}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => startEditing(group)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(group.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              Notes in this group will be moved to Uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
