"use client";

import { useState } from "react";
import { CircleStop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/** "Cancel research" with a confirmation, on the dashboard and the research details page. */
export function CancelResearch({ onCancel }: { onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CircleStop aria-hidden />
        Cancel research
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this research run?"
        actions={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep running
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                onCancel();
              }}
            >
              Cancel research
            </Button>
          </>
        }
      >
        Stories, verifications and drafts finished so far are kept; nothing else will be verified or
        drafted. A new run can start right away.
      </Dialog>
    </>
  );
}
