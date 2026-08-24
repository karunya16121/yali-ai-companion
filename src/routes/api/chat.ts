import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, memories, voiceMode } = (await request.json()) as {
          messages?: Msg[];
          memories?: string[];
          voiceMode?: boolean;
        };
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("messages required", { status: 400 });
        }
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { buildSystemPrompt, YALI_MODEL } = await import("@/lib/yali-prompt");

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Lovable-API-Key": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: YALI_MODEL,
            stream: true,
            messages: [
              {
                role: "system",
                content: buildSystemPrompt({
                  memories: Array.isArray(memories) ? memories.slice(-40) : [],
                  voiceMode: Boolean(voiceMode),
                }),
              },
              ...messages.slice(-24).map((m) => ({ role: m.role, content: m.content })),
            ],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          return new Response(detail || "AI request failed", { status: upstream.status || 502 });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
          },
        });
      },
    },
  },
});
