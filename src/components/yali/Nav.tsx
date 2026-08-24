import { Link } from "@tanstack/react-router";
import { Brain, MessageCircle, Mic, Settings } from "lucide-react";

const items = [
  { to: "/", label: "Voice", icon: Mic },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span
            className="size-6 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 32% 28%, oklch(0.95 0.05 200), oklch(0.6 0.17 300))",
              boxShadow: "0 0 14px oklch(0.75 0.16 250 / 70%)",
            }}
          />
          <span className="font-display text-sm font-semibold tracking-[0.2em] text-gradient">
            YALI AI
          </span>
        </Link>

        <nav className="glass flex items-center gap-1 rounded-full p-1">
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-primary/15 data-[status=active]:text-primary"
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
