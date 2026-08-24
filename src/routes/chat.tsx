import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, Loader2, Mic, Square, Trash2, Volume2 } from "lucide-react";

import {
  createListener,
  createSpeaker,
  extractMemories,
  streamChat,
  uid,
  type Listener,
  type Speaker,
} from "@/lib/yali-client";
import { useConversation, useMemories, useSettings } from "@/lib/yali-store";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat with YALI AI — Tamil, English & Tanglish" },
      {
        name: "description",
        content:
          "Text chat with YALI AI: streaming replies, conversation history, voice input and casual Tanglish conversation.",
      },
      { property: "og:title", content: "Chat with YALI AI" },
      {
        property: "og:description",
        content: "Streaming text chat with your personal AI companion in Tamil, English and Tanglish.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { settings } = useSettings();
  const { memories, add } = useMemories();
  const { messages, append, patchLast, clear } = useConversation();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const listenerRef = useRef<Listener | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef(messages);
  historyRef.current = messages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setInput("");
      const userMsg = { id: uid(), role: "user" as const, content: trimmed, at: Date.now() };
      append(userMsg);
      const payload = [...historyRef.current, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      append({ id: uid(), role: "assistant", content: "", at: Date.now() });

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      try {
        const full = await streamChat({
          messages: payload,
          memories: settings.memoryEnabled ? memories.map((m) => m.fact) : [],
          signal: controller.signal,
          onDelta: (_d, all) => patchLast(extractMemories(all).clean),
        });
        const { clean, facts } = extractMemories(full);
        patchLast(clean);
        if (settings.memoryEnabled) add(facts);
      } catch (err) {
        if (!controller.signal.aborted) {
          toast.error(err instanceof Error ? err.message : "YALI could not respond");
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [add, append, busy, memories, patchLast, settings.memoryEnabled],
  );

  const speak = useCallback(
    async (text: string) => {
      if (!speakerRef.current) speakerRef.current = createSpeaker(settings.voice);
      try {
        await speakerRef.current.speak(text);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Voice playback failed");
      }
    },
    [settings.voice],
  );

  const toggleMic = useCallback(() => {
    if (listening) {
      listenerRef.current?.abort();
      listenerRef.current = null;
      setListening(false);
      return;
    }
    const listener = createListener({
      lang: settings.lang,
      continuous: false,
      onInterim: setInput,
      onFinal: (t) => {
        setInput("");
        void send(t);
      },
      onError: (m) => toast.error(m),
      onEnd: () => {
        listenerRef.current = null;
        setListening(false);
      },
    });
    if (!listener) {
      toast.error("Voice input needs Chrome, Edge or Safari.");
      return;
    }
    listenerRef.current = listener;
    setListening(true);
    listener.start();
  }, [listening, send, settings.lang]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4 pt-5">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Chat with <span className="text-gradient">YALI</span>
        </h1>
        <button
          type="button"
          onClick={clear}
          className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="size-3.5" /> Clear
        </button>
      </div>

      <div className="scrollbar-slim flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="glass mt-6 rounded-3xl px-5 py-8 text-center">
            <p className="font-display text-lg">Vanakkam da 👋</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sollu — Tamil, English or Tanglish. Naan ready.
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          const isUser = m.role === "user";
          const streaming = busy && i === messages.length - 1 && !isUser;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={isUser ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  isUser
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                    : "group max-w-[90%] px-1 py-1 text-sm leading-relaxed text-foreground"
                }
              >
                {!isUser && (
                  <p className="mb-1 text-[11px] uppercase tracking-widest text-primary">YALI</p>
                )}
                <p className="whitespace-pre-wrap">
                  {m.content}
                  {streaming && !m.content && (
                    <Loader2 className="inline size-3.5 animate-spin text-muted-foreground" />
                  )}
                </p>
                {!isUser && m.content && (
                  <button
                    type="button"
                    onClick={() => void speak(m.content)}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                  >
                    <Volume2 className="size-3" /> Play
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="glass sticky bottom-3 flex items-end gap-2 rounded-3xl p-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          placeholder="Sollu da… (Tamil / English / Tanglish)"
          className="max-h-32 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={toggleMic}
          aria-label="Voice input"
          className={`grid size-9 place-items-center rounded-full transition-colors ${listening ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Mic className="size-4" />
        </button>
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            aria-label="Stop"
            className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground"
          >
            <Square className="size-3.5" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim()}
            className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </form>
    </div>
  );
}
