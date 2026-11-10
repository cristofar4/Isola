"use client";

import { useState } from "react";
import { create } from "zustand";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

interface Ask {
  id: number;
  title: string;
  label: string;
  initial: string;
  action: string;
  resolve: (value: string | null) => void;
}

const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }));
let nextId = 1;

/** Ask for a name in a dialog. Resolves to the trimmed name, or null if cancelled. */
export function askName(title: string, options: { label?: string; initial?: string; action?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    useAsk.getState().ask?.resolve(null);
    useAsk.setState({ ask: { id: nextId++, title, label: options.label ?? "Name", initial: options.initial ?? "", action: options.action ?? "Create", resolve } });
  });
}

function close(result: string | null) {
  useAsk.getState().ask?.resolve(result);
  useAsk.setState({ ask: null });
}

function NameForm({ ask }: { ask: Ask }) {
  const [value, setValue] = useState(ask.initial);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.replace(/\s+/g, " ").trim();
        if (v) close(v.slice(0, 80));
      }}
    >
      <TextField label={ask.label} value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} autoFocus required />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => close(null)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!value.trim()}>
          {ask.action}
        </Button>
      </div>
    </form>
  );
}

/** Rendered once by the studio shell. */
export function NameDialogHost() {
  const ask = useAsk((s) => s.ask);
  return (
    <Sheet open={ask !== null} onOpenChange={(o) => !o && close(null)} title={ask?.title ?? ""}>
      {ask && <NameForm key={ask.id} ask={ask} />}
    </Sheet>
  );
}
