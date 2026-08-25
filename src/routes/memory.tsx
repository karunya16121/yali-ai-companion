import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Brain, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useMemories, useSettings } from "@/lib/yali-store";

export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { title: "YALI AI Memory — view, delete and control what YALI remembers" },
      {
        name: "description",
        content:
          "See everything YALI AI remembers about you, delete single memories, clear all, or switch memory off completely.",
      },
      { property: "og:title", content: "YALI AI Memory settings" },
      {
        property: "og:description",
        content: "You stay in control: view, delete or disable YALI AI's personal memory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MemoryPage,
});

function MemoryPage() {
  const { memories, remove, clear } = useMemories();
  const { settings, update } = useSettings();

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 pt-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <Brain className="size-5 text-primary" /> Memory
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        YALI keeps only useful, non-sensitive details you share — your style, projects, goals. Never
        passwords, ids or anything sensitive.
      </p>

      <div className="glass mt-5 flex items-center justify-between gap-4 rounded-2xl px-4 py-3.5">
        <div>
          <p className="text-sm font-medium">Personal memory</p>
          <p className="text-xs text-muted-foreground">
            {settings.memoryEnabled ? "On — YALI remembers useful details" : "Off — nothing new is stored"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => update({ memoryEnabled: !settings.memoryEnabled })}
          role="switch"
          aria-checked={settings.memoryEnabled}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${settings.memoryEnabled ? "bg-primary" : "bg-secondary"}`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-background transition-all ${settings.memoryEnabled ? "left-[1.375rem]" : "left-0.5"}`}
          />
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{memories.length} saved memories</p>
        {memories.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clear();
              toast.success("All memories cleared");
            }}
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" /> Clear all
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {memories.length === 0 && (
          <div className="glass rounded-2xl px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing remembered yet. Keep talking — YALI will pick up the useful bits.
          </div>
        )}
        {[...memories].reverse().map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass flex items-start justify-between gap-3 rounded-2xl px-4 py-3"
          >
            <div>
              <p className="text-sm">{m.fact}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {new Date(m.at).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(m.id)}
              aria-label="Delete memory"
              className="text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
