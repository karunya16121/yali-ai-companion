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
  takeSpeakableChunk,
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
          "Talk naturally with YALI AI in Tamil, English or Tanglish. Continuous listening, instant streaming voice replies, memory and chat.",
      },
      { property: "og:title", content: "YALI AI — Just talk, YALI listens" },
      {
        property: "og:description",
        content: "Continuous real-time voice companion for Tamil, English and Tanglish conversations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoicePage,
});

const HINTS = [
  "Yali enna pandra?",
  "Java project la error varudhu",
  "Tomorrow exam iruku, help pannu",
];

/** silence (ms) after the last word before YALI takes its turn */
const TURN_SILENCE_MS = 1150;

function VoicePage() {
  const { settings } = useSettings();
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
  const finalsRef = useRef("");
  const interimRef = useRef("");
  const turnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  /* live level meter: mic while listening, YALI's own audio while speaking */
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

  const clearTurnTimer = () => {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    turnTimerRef.current = null;
  };

  const respond = useCallback(
    async (text: string) => {
      abortRef.current?.abort();
      speakerRef.current?.stop();

      const controller = new AbortController();
      abortRef.current = controller;
      busyRef.current = true;
      setState("thinking");
      setReply("");

      const userMsg = { id: uid(), role: "user" as const, content: text, at: Date.now() };
      append(userMsg);
      const payload = [...historyRef.current, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      append({ id: uid(), role: "assistant", content: "", at: Date.now() });

      const speaker = getSpeaker();
      let pendingSpeech = "";
      let started = false;

      try {
        const full = await streamChat({
          messages: payload,
          memories: settingsRef.current.memoryEnabled ? memRef.current.map((m) => m.fact) : [],
          voiceMode: true,
          signal: controller.signal,
          onDelta: (delta, all) => {
            const { clean } = extractMemories(all);
            setReply(clean);
            patchLast(clean);
            if (!settingsRef.current.autoSpeak) return;
            pendingSpeech += delta;
            // Start speaking the moment the first full sentence is ready.
            const taken = takeSpeakableChunk(extractMemories(pendingSpeech).clean);
            if (taken && taken.chunk) {
              pendingSpeech = taken.rest;
              if (!started) {
                started = true;
                setState("speaking");
                listenerRef.current?.stop();
              }
              void speaker.queue(taken.chunk);
            }
          },
        });

        const { clean, facts } = extractMemories(full);
        patchLast(clean);
        setReply(clean);
        if (settingsRef.current.memoryEnabled) add(facts);

        const tail = extractMemories(pendingSpeech).clean.trim();
        if (settingsRef.current.autoSpeak && !controller.signal.aborted) {
          if (!started && clean) {
            started = true;
            setState("speaking");
            listenerRef.current?.stop();
            await speaker.speak(clean);
          } else if (tail) {
            setState("speaking");
            await speaker.queue(tail);
          }
        }
        // wait for playback to drain so we don't re-open the mic over YALI's voice
        while (!controller.signal.aborted && speaker.speaking()) {
          await new Promise((r) => setTimeout(r, 120));
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          toast.error(err instanceof Error ? err.message : "YALI could not respond");
        }
      } finally {
        busyRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
        if (micOnRef.current) {
          finalsRef.current = "";
          interimRef.current = "";
          setState("listening");
          listenerRef.current?.start();
        } else {
          setState("idle");
        }
      }
    },
    [add, append, getSpeaker, patchLast],
  );

  /** called when the user has gone quiet long enough — full sentence captured */
  const takeTurn = useCallback(() => {
    clearTurnTimer();
    const text = `${finalsRef.current} ${interimRef.current}`.replace(/\s+/g, " ").trim();
    finalsRef.current = "";
    interimRef.current = "";
    if (text.length < 2) return;
    setHeard(text);
    void respond(text);
  }, [respond]);

  const scheduleTurn = useCallback(() => {
    clearTurnTimer();
    turnTimerRef.current = setTimeout(takeTurn, TURN_SILENCE_MS);
  }, [takeTurn]);

  const bargeIn = useCallback(() => {
    if (speakerRef.current?.speaking() || busyRef.current) {
      speakerRef.current?.stop();
      abortRef.current?.abort();
      busyRef.current = false;
      setState("interrupted");
    }
  }, []);

  const stopEverything = useCallback(() => {
    bargeIn();
    setState(micOnRef.current ? "listening" : "idle");
    if (micOnRef.current) listenerRef.current?.start();
  }, [bargeIn]);

  const startMic = useCallback(async () => {
    if (!getRecognitionCtor()) {
      toast.error("Live voice needs Chrome, Edge or Safari. Chat mode works everywhere.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
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

    // warm up the audio output inside the user gesture so playback is instant
    getSpeaker();

    const listener = createListener({
      lang: settingsRef.current.lang,
      continuous: true,
      onInterim: (t) => {
        interimRef.current = t;
        setHeard(`${finalsRef.current} ${t}`.trim());
        if (t.length > 2) bargeIn();
        scheduleTurn();
      },
      onFinal: (t) => {
        // Never answer a single fragment: keep collecting until real silence.
        finalsRef.current = `${finalsRef.current} ${t}`.trim();
        interimRef.current = "";
        setHeard(finalsRef.current);
        bargeIn();
        scheduleTurn();
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
  }, [bargeIn, getSpeaker, scheduleTurn]);

  const stopMic = useCallback(() => {
    micOnRef.current = false;
    clearTurnTimer();
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
      ? "Listening… sollu, naan wait pandren"
      : state === "thinking"
        ? "Thinking…"
        : state === "speaking"
          ? "Speaking… (just talk to interrupt)"
          : state === "interrupted"
            ? "Okay, sollu…"
            : micOn
              ? "Ready"
              : "Tap once and just talk";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 pb-10 pt-6 text-center">
      <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Voice mode</p>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
        Talk to <span className="text-gradient">YALI</span>
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Continuous conversation in Tamil, English or Tanglish. YALI waits for you to finish, then
        replies — interrupt anytime.
      </p>

      <div className="mt-8">
        <YaliOrb state={state} level={level} onClick={() => (micOn ? stopMic() : void startMic())} />
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
          {micOn ? "End conversation" : "Start conversation"}
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
                onClick={() => {
                  setHeard(h);
                  void respond(h);
                }}
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
