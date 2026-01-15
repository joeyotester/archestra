"use client";

import { archestraApiSdk } from "@shared";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type ProfileLabel,
  ProfileLabels,
  type ProfileLabelsRef,
} from "@/components/agent-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLabelKeys, useProfiles, useUpdateProfile } from "@/lib/agent.query";
import { useHasPermissions } from "@/lib/auth.query";

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string | null;
}

export function ProfileEditDialog({
  open,
  onOpenChange,
  profileId,
}: ProfileEditDialogProps) {
  const { data: profiles = [] } = useProfiles();
  const updateProfile = useUpdateProfile();
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const response = await archestraApiSdk.getTeams();
      return response.data || [];
    },
  });
  const { data: availableKeys = [] } = useLabelKeys();
  const { data: isProfileAdmin } = useHasPermissions({ profile: ["admin"] });

  const [name, setName] = useState("");
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>([]);
  const [labels, setLabels] = useState<ProfileLabel[]>([]);
  const [considerContextUntrusted, setConsiderContextUntrusted] =
    useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const agentLabelsRef = useRef<ProfileLabelsRef>(null);

  const profile = profiles.find((p) => p.id === profileId);

  // Non-admin users must have at least one team assigned
  const requiresTeamSelection = !isProfileAdmin && assignedTeamIds.length === 0;

  // Sync state when profile changes
  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setAssignedTeamIds(profile.teams?.map((t) => t.id) || []);
      setLabels(profile.labels || []);
      setConsiderContextUntrusted(profile.considerContextUntrusted ?? false);
    }
  }, [profile]);

  const handleAddTeam = useCallback(
    (teamId: string) => {
      if (teamId && !assignedTeamIds.includes(teamId)) {
        setAssignedTeamIds([...assignedTeamIds, teamId]);
        setSelectedTeamId("");
      }
    },
    [assignedTeamIds],
  );

  const handleRemoveTeam = useCallback(
    (teamId: string) => {
      setAssignedTeamIds(assignedTeamIds.filter((id) => id !== teamId));
    },
    [assignedTeamIds],
  );

  const getUnassignedTeams = useCallback(() => {
    if (!teams) return [];
    return teams.filter((team) => !assignedTeamIds.includes(team.id));
  }, [teams, assignedTeamIds]);

  const getTeamById = useCallback(
    (teamId: string) => {
      return teams?.find((team) => team.id === teamId);
    },
    [teams],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!profileId || !name.trim()) {
        toast.error("Please enter a profile name");
        return;
      }

      // Non-admin users must have at least one team assigned
      if (!isProfileAdmin && assignedTeamIds.length === 0) {
        toast.error("Please select at least one team");
        return;
      }

      // Save any unsaved label before submitting
      const updatedLabels =
        agentLabelsRef.current?.saveUnsavedLabel() || labels;

      try {
        await updateProfile.mutateAsync({
          id: profileId,
          data: {
            name: name.trim(),
            teams: assignedTeamIds,
            labels: updatedLabels,
            considerContextUntrusted,
          },
        });
        toast.success("Profile updated successfully");
        onOpenChange(false);
      } catch (_error) {
        toast.error("Failed to update profile");
      }
    },
    [
      profileId,
      name,
      assignedTeamIds,
      labels,
      updateProfile,
      onOpenChange,
      considerContextUntrusted,
      isProfileAdmin,
    ],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Update the profile's name and assign teams.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="grid gap-4 overflow-y-auto pr-2 pb-4 space-y-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Profile Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My AI Profile"
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label>
                Team Access
                {!isProfileAdmin && (
                  <span className="text-destructive ml-1">(required)</span>
                )}
              </Label>
              <p className="text-sm text-muted-foreground">
                Assign teams to grant their members access to this profile.
              </p>
              <Select value={selectedTeamId} onValueChange={handleAddTeam}>
                <SelectTrigger id="assign-team">
                  <SelectValue placeholder="Select a team to assign" />
                </SelectTrigger>
                <SelectContent>
                  {teams?.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No teams available
                    </div>
                  ) : getUnassignedTeams().length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      All teams are already assigned
                    </div>
                  ) : (
                    getUnassignedTeams().map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {assignedTeamIds.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {assignedTeamIds.map((teamId) => {
                    const team = getTeamById(teamId);
                    return (
                      <Badge
                        key={teamId}
                        variant="secondary"
                        className="flex items-center gap-1 pr-1"
                      >
                        <span>{team?.name || teamId}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTeam(teamId)}
                          className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {isProfileAdmin
                    ? "No teams assigned yet. Admins have access to all profiles."
                    : "No teams assigned yet."}
                </p>
              )}
            </div>

            <ProfileLabels
              ref={agentLabelsRef}
              labels={labels}
              onLabelsChange={setLabels}
              availableKeys={availableKeys}
            />

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-consider-context-untrusted"
                checked={considerContextUntrusted}
                onCheckedChange={(checked) =>
                  setConsiderContextUntrusted(checked === true)
                }
              />
              <div className="grid gap-1">
                <Label
                  htmlFor="edit-consider-context-untrusted"
                  className="text-sm font-medium cursor-pointer"
                >
                  Treat user context as untrusted
                </Label>
                <p className="text-sm text-muted-foreground">
                  Enable when user prompts may contain untrusted and sensitive
                  data.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateProfile.isPending || requiresTeamSelection}
            >
              {updateProfile.isPending ? "Updating..." : "Update profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
