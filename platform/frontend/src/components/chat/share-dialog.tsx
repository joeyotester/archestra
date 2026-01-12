"use client";

import { Lock, Users } from "lucide-react";
import { useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { type ShareMode, useShareConversation } from "@/lib/chat.query";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentShareMode: ShareMode;
}

export function ShareDialog({
  open,
  onOpenChange,
  conversationId,
  currentShareMode,
}: ShareDialogProps) {
  const shareConversation = useShareConversation();

  const handleShareModeChange = useCallback(
    (value: ShareMode) => {
      shareConversation.mutate({
        id: conversationId,
        shareMode: value,
      });
    },
    [conversationId, shareConversation],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share conversation</DialogTitle>
          <DialogDescription>
            Choose who can access this conversation. Only you can send messages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup
            value={currentShareMode}
            onValueChange={(value) => handleShareModeChange(value as ShareMode)}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="private" id="private" className="mt-1" />
              <Label htmlFor="private" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  <span className="font-medium">Private</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Only you can view this conversation.
                </p>
              </Label>
            </div>

            <div className="flex items-start space-x-3">
              <RadioGroupItem
                value="organization"
                id="organization"
                className="mt-1"
              />
              <Label htmlFor="organization" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="font-medium">Organization</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Anyone in your organization can view this conversation.
                </p>
              </Label>
            </div>
          </RadioGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
