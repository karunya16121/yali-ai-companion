import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/speech")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text, voice } = (await request.json()) as { text?: string; voice?: string };
        if (!text || !text.trim()) return new Response("text required", { status: 400 });

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        try {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: text.slice(0, 3000),
              voice: voice || "alloy",
              instructions:
                "Speak like a warm, casual young friend chatting. Natural pace, light energy. Handle Tamil, English and mixed Tanglish text smoothly.",
              stream_format: "sse",
              response_format: "pcm",
            }),
            signal: request.signal,
          });

          if (!upstream.ok || !upstream.body) {
            const detail = await upstream.text().catch(() => "");
            return new Response(detail || "TTS failed", { status: upstream.status || 502 });
          }

          return new Response(upstream.body, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
            },
          });
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          throw err;
        }
      },
    },
  },
});
