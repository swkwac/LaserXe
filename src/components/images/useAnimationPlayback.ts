import * as React from "react";
import type { TimelineFrame } from "@/lib/animationUtils";

/**
 * Runs the animation timer: advances currentFrameIndex every stepMs until totalFrames - 1, then stops and sets playing to false.
 * Cleans up the interval on unmount or when playing becomes false.
 */
export function useAnimationPlayback(
  playing: boolean,
  totalFrames: number,
  animationDurationMs: number,
  setCurrentFrameIndex: React.Dispatch<React.SetStateAction<number>>,
  setPlaying: (value: boolean) => void
): void {
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    if (!playing || totalFrames <= 0) return;
    const stepMs = animationDurationMs / totalFrames;
    timerRef.current = setInterval(() => {
      setCurrentFrameIndex((i) => {
        if (i >= totalFrames - 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, stepMs);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing, totalFrames, animationDurationMs, setCurrentFrameIndex, setPlaying]);
}

/**
 * Real-time playback for advanced mode: uses elapsed time to index into timeline with t_ms.
 * Animation runs for totalDurationMs; points appear at their actual estimated treatment times.
 */
export function useAnimationPlaybackRealtime(
  playing: boolean,
  timeline: TimelineFrame[],
  totalDurationMs: number,
  setCurrentFrameIndex: React.Dispatch<React.SetStateAction<number>>,
  setPlaying: (value: boolean) => void
): void {
  const startTimeRef = React.useRef<number>(0);
  const rafRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!playing || timeline.length === 0 || totalDurationMs <= 0) return;

    startTimeRef.current = performance.now();

    const tick = () => {
      const elapsed = performance.now() - startTimeRef.current;
      if (elapsed >= totalDurationMs) {
        setCurrentFrameIndex(timeline.length - 1);
        setPlaying(false);
        return;
      }
      const idx = findFrameIndexAtTime(timeline, elapsed);
      setCurrentFrameIndex(idx);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, timeline, totalDurationMs, setCurrentFrameIndex, setPlaying]);
}

function findFrameIndexAtTime(timeline: TimelineFrame[], elapsedMs: number): number {
  if (timeline.length === 0) return 0;
  const last = timeline[timeline.length - 1];
  if (last?.t_ms != null && elapsedMs >= last.t_ms) return timeline.length - 1;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const t = timeline[i]?.t_ms;
    if (t != null && t <= elapsedMs) return i;
  }
  return 0;
}
