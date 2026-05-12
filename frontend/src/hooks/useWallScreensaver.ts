import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../api/socket';

interface Options {
  /** ms without any activity before screen goes black; 0 = disabled */
  screensaverMs: number;
  /** ms without any activity before camera stream is paused; 0 = disabled */
  cameraSleepMs: number;
  /** called when motion or touch wakes the display */
  onWake?: () => void;
}

interface ScreensaverState {
  /** true when display is dimmed to black */
  isScreensaverActive: boolean;
  /** true when camera should be suspended */
  isCameraSleeping: boolean;
  /** call to wake manually (e.g. on touch/click) */
  wake: () => void;
}

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel',
];

export function useWallScreensaver({
  screensaverMs,
  cameraSleepMs,
  onWake,
}: Options): ScreensaverState {
  const [isScreensaverActive, setIsScreensaverActive] = useState(false);
  const [isCameraSleeping, setIsCameraSleeping] = useState(false);

  const screensaverTimerRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearTimers = () => {
    if (screensaverTimerRef.current) {
      window.clearTimeout(screensaverTimerRef.current);
      screensaverTimerRef.current = null;
    }
    if (cameraTimerRef.current) {
      window.clearTimeout(cameraTimerRef.current);
      cameraTimerRef.current = null;
    }
  };

  const scheduleTimers = useCallback(() => {
    clearTimers();

    if (cameraSleepMs > 0) {
      cameraTimerRef.current = window.setTimeout(() => {
        setIsCameraSleeping(true);
      }, cameraSleepMs);
    }

    if (screensaverMs > 0) {
      screensaverTimerRef.current = window.setTimeout(() => {
        setIsScreensaverActive(true);
      }, screensaverMs);
    }
  }, [cameraSleepMs, screensaverMs]);

  const wake = useCallback(() => {
    const wasAsleep = isScreensaverActive || isCameraSleeping;
    setIsScreensaverActive(false);
    setIsCameraSleeping(false);
    lastActivityRef.current = Date.now();
    scheduleTimers();
    if (wasAsleep) onWake?.();
  }, [isScreensaverActive, isCameraSleeping, scheduleTimers, onWake]);

  // Activity listener for user interaction
  useEffect(() => {
    const handleActivity = () => wake();

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true }),
    );

    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, handleActivity),
      );
    };
  }, [wake]);

  // Socket.io: PIR motion event wakes the display
  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;

    const handleMotion = () => wake();
    sock.on('motion-detected', handleMotion);
    return () => { sock.off('motion-detected', handleMotion); };
  }, [wake]);

  // Start timers on mount and when config changes
  useEffect(() => {
    scheduleTimers();
    return () => clearTimers();
  }, [scheduleTimers]);

  return { isScreensaverActive, isCameraSleeping, wake };
}
