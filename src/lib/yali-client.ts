export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
};

export const REMEMBER_RE = /\[\[remember:\s*([^\]]+)\]\]/gi;

export function extractMemories(text: string) {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  REMEMBER_RE.lastIndex = 0;
  while ((m = REMEMBER_RE.exec(text))) {
    const fact = m[1]?.trim();
    if (fact) found.push(fact);
  }
  return { clean: text.replace(REMEMBER_RE, "").trim(), facts: found };
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function* sseLines(res: Response, signal?: AbortSignal) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
      }
    }
  } finally {
    if (signal?.aborted) reader.cancel().catch(() => {});
  }
}

/** Streams YALI's reply. onDelta receives incremental text chunks. */
export async function streamChat(opts: {
  messages: { role: "user" | "assistant"; content: string }[];
  memories: string[];
  voiceMode?: boolean;
  signal?: AbortSignal;
  onDelta: (delta: string, full: string) => void;
}): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: opts.messages,
      memories: opts.memories,
      voiceMode: opts.voiceMode,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(errorMessage(res.status, detail));
  }

  let full = "";
  for await (const data of sseLines(res, opts.signal)) {
    if (data === "[DONE]") break;
    try {
      const json = JSON.parse(data) as {
        choices?: { delta?: { content?: string } }[];
      };
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        opts.onDelta(delta, full);
      }
    } catch {
      /* ignore keep-alives */
    }
  }
  return full;
}

export function errorMessage(status: number, detail: string) {
  if (status === 429) return "YALI is getting a lot of requests right now — try again in a moment.";
  if (status === 402) return "AI credits are exhausted. Add credits to keep chatting with YALI.";
  if (status === 403) return "AI access is blocked for this workspace.";
  return detail?.slice(0, 200) || `Something went wrong (${status}).`;
}

/* ------------------------------ streaming TTS ------------------------------ */

export type Speaker = {
  /** Speak text now, cancelling anything currently queued. */
  speak: (text: string) => Promise<void>;
  /** Append a chunk to the current utterance (sequential, gapless). */
  queue: (text: string) => Promise<void>;
  stop: () => void;
  /** 0..1 loudness of what YALI is currently saying */
  level: () => number;
  speaking: () => boolean;
};

export function createSpeaker(voice = "alloy"): Speaker {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let gain: GainNode | null = null;
  let sources: AudioBufferSourceNode[] = [];
  const controllers = new Set<AbortController>();
  let playhead = 0;
  let active = false;
  let session = 0;
  let chain: Promise<void> = Promise.resolve();
  let data: Uint8Array | null = null;

  const ensureCtx = async () => {
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: 24000 });
      gain = ctx.createGain();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      data = new Uint8Array(analyser.frequencyBinCount);
      gain.connect(analyser);
      analyser.connect(ctx.destination);
    }
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    return ctx;
  };

  const stop = () => {
    session += 1;
    active = false;
    for (const c of controllers) c.abort();
    controllers.clear();
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    sources = [];
    playhead = 0;
    chain = Promise.resolve();
  };

  const render = async (text: string, mySession: number) => {
    if (!text.trim() || mySession !== session) return;
    const audio = await ensureCtx();
    const controller = new AbortController();
    controllers.add(controller);
    active = true;
    let pending = new Uint8Array(0);

    const push = (incoming: Uint8Array) => {
      if (mySession !== session) return;
      const bytes = new Uint8Array(pending.length + incoming.length);
      bytes.set(pending);
      bytes.set(incoming, pending.length);
      const usable = bytes.length - (bytes.length % 2);
      pending = bytes.slice(usable);
      if (usable === 0) return;
      const samples = new Int16Array(bytes.buffer, 0, usable / 2);
      const floats = Float32Array.from(samples, (s) => s / 32768);
      const buffer = audio.createBuffer(1, floats.length, 24000);
      buffer.copyToChannel(floats, 0);
      const src = audio.createBufferSource();
      src.buffer = buffer;
      src.connect(gain!);
      playhead = playhead === 0 ? audio.currentTime + 0.08 : Math.max(playhead, audio.currentTime);
      src.start(playhead);
      playhead += buffer.duration;
      sources.push(src);
      src.onended = () => {
        sources = sources.filter((s) => s !== src);
        if (sources.length === 0 && controllers.size === 0) active = false;
      };
    };

    try {
      const res = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(errorMessage(res.status, detail));
      }
      for await (const chunk of sseLines(res, controller.signal)) {
        if (mySession !== session) break;
        try {
          const payload = JSON.parse(chunk) as { type?: string; audio?: string };
          if (payload.type !== "speech.audio.delta" || !payload.audio) continue;
          const bin = atob(payload.audio);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          push(bytes);
        } catch {
          /* ignore */
        }
      }
    } finally {
      controllers.delete(controller);
      if (sources.length === 0 && controllers.size === 0) active = false;
    }
  };

  const queue = (text: string) => {
    const mySession = session;
    const next = chain.then(() => render(text, mySession)).catch(() => {});
    chain = next;
    return next;
  };

  const speak = (text: string) => {
    stop();
    return queue(text);
  };

  return {
    speak,
    queue,
    stop,
    speaking: () => active,
    level: () => {
      if (!analyser || !data || !active) return 0;
      analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
      return Math.min(1, peak * 1.6);
    },
  };
}

/** Splits streamed text into speakable chunks at sentence boundaries. */
export function takeSpeakableChunk(buffer: string, minLength = 40) {
  const match = /[.!?…]+["')\]]*\s|\n+/g;
  let cut = -1;
  let m: RegExpExecArray | null;
  while ((m = match.exec(buffer))) {
    if (m.index + m[0].length >= minLength) {
      cut = m.index + m[0].length;
      break;
    }
    cut = m.index + m[0].length;
  }
  if (cut < 0 || cut < minLength) {
    if (buffer.length < 220) return null;
    const comma = buffer.lastIndexOf(", ");
    if (comma > minLength) cut = comma + 2;
    else return null;
  }
  return { chunk: buffer.slice(0, cut).trim(), rest: buffer.slice(cut) };
}


/* --------------------------- speech recognition ---------------------------- */

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};

export function getRecognitionCtor(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type Listener = {
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function createListener(opts: {
  lang: string;
  continuous: boolean;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): Listener | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = opts.lang;
  rec.continuous = opts.continuous;
  rec.interimResults = true;

  rec.onresult = (event: unknown) => {
    const e = event as {
      resultIndex: number;
      results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } };
    };
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const text = res[0].transcript;
      if (res.isFinal) {
        const final = text.trim();
        if (final) opts.onFinal(final);
      } else {
        interim += text;
      }
    }
    if (interim.trim()) opts.onInterim(interim.trim());
  };
  rec.onerror = (event: unknown) => {
    const err = (event as { error?: string }).error ?? "unknown";
    if (err === "no-speech" || err === "aborted") return;
    opts.onError(
      err === "not-allowed"
        ? "Mic permission denied. Allow microphone access to talk to YALI."
        : `Mic error: ${err}`,
    );
  };
  rec.onend = () => opts.onEnd();

  return {
    start: () => {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* not running */
      }
    },
    abort: () => {
      try {
        rec.abort();
      } catch {
        /* not running */
      }
    },
  };
}
