import * as React from "react";

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
