import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mic, MicOff, Square } from "lucide-react";

import { YaliOrb, type OrbState } from "@/components/yali/YaliOrb";
import {
  createListener,
  createSpeaker,
  extractMemories,
  getRecognitionCtor,
  streamChat,
  uid,
  type Listener,
  type Speaker,
} from "@/lib/yali-client";
import { useConversation, useMemories, useSettings } from "@/lib/yali-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "YALI AI — Voice-first personal AI companion" },
      {
        name: "description",
        content:
          "Tap the mic and talk naturally with YALI AI in Tamil, English or Tanglish. Instant streaming voice replies, memory and chat.",
      },
      { property: "og:title", content: "YALI AI — Talk naturally, get instant voice replies" },
      {
        property: "og:description",
        content: "Your personal voice-first AI companion for Tamil, English and Tanglish chats.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoicePage,
});

const HINTS = ["Yali enna pandra?", "Explain closures simply", "Naan konjam bore ah iruken da"];

function VoicePage() {
  const { settings, ready } = useSettings();
  const { memories, add } = useMemories();
  const { messages, append, patchLast } = useConversation();

  const [state, setState] = useState<OrbState>("idle");
  const [micOn, setMicOn] = useState(false);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [level, setLevel] = useState(0);
  const [supported, setSupported] = useState(true);

  const speakerRef = useRef<Speaker | null>(null);
  const listenerRef = useRef<Listener | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const micOnRef = useRef(false);
  const busyRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const historyRef = useRef(messages);
  const memRef = useRef(memories);
  const settingsRef = useRef(settings);

  historyRef.current = messages;
  memRef.current = memories;
  settingsRef.current = settings;

  useEffect(() => setSupported(Boolean(getRecognitionCtor())), []);

  const getSpeaker = useCallback(() => {
    if (!speakerRef.current) speakerRef.current = createSpeaker(settingsRef.current.voice);
    return speakerRef.current;
  }, []);

  /* mic + speaking level meter */
  useEffect(() => {
    let raf = 0;
    const data = new Uint8Array(128);
    const tick = () => {
      const analyser = analyserRef.current;
      let mic = 0;
      if (analyser) {
        analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
        for (let i = 0; i < data.length; i++) mic = Math.max(mic, Math.abs(data[i] - 128) / 128);
        mic = Math.min(1, mic * 2.4);
      }
      const spk = speakerRef.current?.level() ?? 0;
      setLevel(speakerRef.current?.speaking() ? spk : mic);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const stopEverything = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    speakerRef.current?.stop();
    busyRef.current = false;
    setState(micOnRef.current ? "listening" : "idle");
  }, []);

  const respond = useCallback(
    async (text: string) => {
      // Natural interruption: whatever YALI was doing stops right away.
      abortRef.current?.abort();
      speakerRef.current?.stop();

      const controller = new AbortController();
      abortRef.current = controller;
      busyRef.current = true;
      setState("thinking");
      setReply("");

      const userMsg = { id: uid(), role: "user" as const, content: text, at: Date.now() };
      append(userMsg);
      const base = [...historyRef.current, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      append({ id: uid(), role: "assistant", content: "", at: Date.now() });

      let spoken = false;
      const speaker = getSpeaker();

      try {
        const full = await streamChat({
          messages: base,
          memories: settingsRef.current.memoryEnabled ? memRef.current.map((m) => m.fact) : [],
          voiceMode: true,
          signal: controller.signal,
          onDelta: (_d, all) => {
            const { clean } = extractMemories(all);
            setReply(clean);
            patchLast(clean);
            // start speaking as soon as a first useful sentence exists
            if (!spoken && settingsRef.current.autoSpeak && /[.!?…\n]|,\s/.test(clean) && clean.length > 18) {
              spoken = true;
            }
          },
        });

        const { clean, facts } = extractMemories(full);
        patchLast(clean);
        setReply(clean);
        if (settingsRef.current.memoryEnabled) add(facts);

        if (settingsRef.current.autoSpeak && clean && !controller.signal.aborted) {
          setState("speaking");
          listenerRef.current?.stop();
          await speaker.speak(clean);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          toast.error(err instanceof Error ? err.message : "YALI could not respond");
        }
      } finally {
        busyRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
        if (micOnRef.current) {
          setState("listening");
          listenerRef.current?.start();
        } else {
          setState("idle");
        }
      }
    },
    [add, append, getSpeaker, patchLast],
  );

  const startMic = useCallback(async () => {
    if (!getRecognitionCtor()) {
      toast.error("Voice input needs Chrome, Edge or Safari.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
    } catch {
      toast.error("Mic permission denied. Allow microphone access to talk to YALI.");
      return;
    }

    const listener = createListener({
      lang: settingsRef.current.lang,
      continuous: settingsRef.current.handsFree,
      onInterim: (t) => {
        setHeard(t);
        // barge-in: user speaks while YALI talks
        if (speakerRef.current?.speaking() && t.length > 2) {
          speakerRef.current.stop();
          abortRef.current?.abort();
        }
      },
      onFinal: (t) => {
        setHeard(t);
        void respond(t);
      },
      onError: (m) => toast.error(m),
      onEnd: () => {
        if (micOnRef.current && !busyRef.current && !speakerRef.current?.speaking()) {
          listenerRef.current?.start();
        }
      },
    });
    if (!listener) return;
    listenerRef.current = listener;
    micOnRef.current = true;
    setMicOn(true);
    setState("listening");
    listener.start();
  }, [respond]);

  const stopMic = useCallback(() => {
    micOnRef.current = false;
    setMicOn(false);
    listenerRef.current?.abort();
    listenerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setState(speakerRef.current?.speaking() ? "speaking" : "idle");
  }, []);

  useEffect(() => () => stopMic(), [stopMic]);

  const label =
    state === "listening"
      ? "Listening…"
      : state === "thinking"
        ? "Thinking…"
        : state === "speaking"
          ? "Speaking…"
          : micOn
            ? "Ready — sollu da"
            : "Tap the mic and just talk";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 pb-10 pt-6 text-center">
      <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Voice mode</p>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
        Talk to <span className="text-gradient">YALI</span>
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Tamil, English or Tanglish — speak naturally, interrupt anytime.
      </p>

      <div className="mt-8">
        <YaliOrb
          state={state}
          level={level}
          onClick={() => (micOn ? stopMic() : void startMic())}
        />
      </div>

      <motion.p
        key={label}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 text-sm font-medium text-primary"
      >
        {state === "thinking" && <Loader2 className="mr-1 inline size-3.5 animate-spin" />}
        {label}
      </motion.p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (micOn ? stopMic() : void startMic())}
          className="glass flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-transform hover:scale-[1.02]"
        >
          {micOn ? <MicOff className="size-4" /> : <Mic className="size-4 text-primary" />}
          {micOn ? "Stop mic" : "Start talking"}
        </button>
        {(state === "speaking" || state === "thinking") && (
          <button
            type="button"
            onClick={stopEverything}
            className="glass flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Square className="size-3.5" /> Interrupt
          </button>
        )}
      </div>

      {!supported && !ready && null}
      {!supported && (
        <p className="mt-4 text-xs text-destructive">
          Live voice input needs Chrome, Edge or Safari. Chat mode still works everywhere.
        </p>
      )}

      <div className="mt-8 w-full space-y-3 text-left">
        {heard && (
          <div className="glass rounded-2xl px-4 py-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">You</p>
            <p className="mt-1 text-sm">{heard}</p>
          </div>
        )}
        {reply && (
          <div className="glass rounded-2xl px-4 py-3 ring-1 ring-primary/20">
            <p className="text-[11px] uppercase tracking-widest text-primary">YALI</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{reply}</p>
          </div>
        )}
        {!heard && !reply && (
          <div className="flex flex-wrap justify-center gap-2">
            {HINTS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => void respond(h)}
                className="glass rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
