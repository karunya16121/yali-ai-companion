import { useCallback, useEffect, useState } from "react";
import type { ChatMessage } from "./yali-client";
import { uid } from "./yali-client";

export type Memory = { id: string; fact: string; at: number };

export type Settings = {
  memoryEnabled: boolean;
  autoSpeak: boolean;
  voice: string;
  lang: string;
  handsFree: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  memoryEnabled: true,
  autoSpeak: true,
  voice: "alloy",
  lang: "ta-IN",
  handsFree: true,
};

export const LANGS = [
  { value: "ta-IN", label: "Tamil / Tanglish (ta-IN)" },
  { value: "en-IN", label: "English — India (en-IN)" },
  { value: "en-US", label: "English — US (en-US)" },
];

export const VOICES = ["alloy", "verse", "coral", "sage", "shimmer"];

const KEYS = {
  memories: "yali.memories.v1",
  settings: "yali.settings.v1",
  chat: "yali.chat.v1",
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...(fallback as object), ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

const listeners = new Set<() => void>();
function broadcast() {
  listeners.forEach((l) => l());
}

function useStoreSync(refresh: () => void) {
  useEffect(() => {
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, [refresh]);
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setSettings(read<Settings>(KEYS.settings, DEFAULT_SETTINGS));
    setReady(true);
  }, []);

  useEffect(refresh, [refresh]);
  useStoreSync(refresh);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      write(KEYS.settings, next);
      queueMicrotask(broadcast);
      return next;
    });
  }, []);

  return { settings, update, ready };
}

export function useMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);

  const refresh = useCallback(() => setMemories(readList<Memory>(KEYS.memories)), []);
  useEffect(refresh, [refresh]);
  useStoreSync(refresh);

  const add = useCallback((facts: string[]) => {
    if (!facts.length) return;
    const current = readList<Memory>(KEYS.memories);
    const existing = new Set(current.map((m) => m.fact.toLowerCase()));
    const additions = facts
      .filter((f) => f && !existing.has(f.toLowerCase()))
      .map((fact) => ({ id: uid(), fact, at: Date.now() }));
    if (!additions.length) return;
    const next = [...current, ...additions].slice(-80);
    write(KEYS.memories, next);
    setMemories(next);
    broadcast();
  }, []);

  const remove = useCallback((id: string) => {
    const next = readList<Memory>(KEYS.memories).filter((m) => m.id !== id);
    write(KEYS.memories, next);
    setMemories(next);
    broadcast();
  }, []);

  const clear = useCallback(() => {
    write(KEYS.memories, []);
    setMemories([]);
    broadcast();
  }, []);

  return { memories, add, remove, clear };
}

export function useConversation() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    setMessages(readList<ChatMessage>(KEYS.chat));
    setLoaded(true);
  }, []);
  useEffect(refresh, [refresh]);
  useStoreSync(refresh);

  const persist = useCallback((next: ChatMessage[]) => {
    write(KEYS.chat, next.slice(-200));
  }, []);

  const append = useCallback(
    (msg: ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const patchLast = useCallback(
    (content: string) => {
      setMessages((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], content };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clear = useCallback(() => {
    write(KEYS.chat, []);
    setMessages([]);
    broadcast();
  }, []);

  return { messages, append, patchLast, clear, loaded };
}
