import { motion } from "motion/react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

const RING = {
  idle: "oklch(0.7 0.06 250 / 35%)",
  listening: "oklch(0.78 0.16 190 / 75%)",
  thinking: "oklch(0.8 0.18 90 / 70%)",
  speaking: "oklch(0.72 0.19 320 / 80%)",
};

export function YaliOrb({
  state,
  level = 0,
  size = 260,
  onClick,
}: {
  state: OrbState;
  level?: number;
  size?: number;
  onClick?: () => void;
}) {
  const boost = 1 + Math.min(0.22, level * 0.28);
  const active = state !== "idle";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="YALI orb"
      className="relative grid place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring"
      style={{ width: size, height: size }}
      whileTap={{ scale: 0.97 }}
    >
      <motion.span
        className="absolute inset-0 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${RING[state]}, transparent 70%)`,
        }}
        animate={{ scale: active ? [1, 1.12, 1] : [1, 1.04, 1], opacity: active ? 0.95 : 0.6 }}
        transition={{ duration: state === "thinking" ? 1.2 : 2.4, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.span
        className="absolute rounded-full border"
        style={{ inset: 6, borderColor: RING[state] }}
        animate={{
          scale: state === "listening" ? boost : active ? [1, 1.05, 1] : 1,
          rotate: state === "thinking" ? 360 : 0,
        }}
        transition={{
          scale: { duration: state === "listening" ? 0.12 : 2, repeat: state === "listening" ? 0 : Infinity },
          rotate: { duration: 6, repeat: Infinity, ease: "linear" },
        }}
      />

      <motion.span
        className="absolute rounded-full border border-dashed opacity-40"
        style={{ inset: 24, borderColor: RING[state] }}
        animate={{ rotate: active ? -360 : 0 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />

      <motion.span
        className="relative grid place-items-center rounded-full"
        style={{
          width: size * 0.56,
          height: size * 0.56,
          background:
            "radial-gradient(circle at 32% 28%, oklch(0.95 0.05 200 / 90%), oklch(0.62 0.16 235 / 85%) 42%, oklch(0.35 0.14 300 / 92%) 100%)",
          boxShadow: `0 0 ${40 + level * 60}px ${RING[state]}, 0 0 0 1px oklch(1 0 0 / 20%) inset`,
        }}
        animate={{ scale: state === "speaking" ? boost : active ? [1, 1.03, 1] : [1, 1.015, 1] }}
        transition={{
          duration: state === "speaking" ? 0.1 : 2.6,
          repeat: state === "speaking" ? 0 : Infinity,
          ease: "easeInOut",
        }}
      >
        <span className="font-display text-2xl font-semibold tracking-[0.28em] text-foreground/90">
          YALI
        </span>
      </motion.span>
    </motion.button>
  );
}
