import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import type { FaceDescriptorEntry } from '../api/types';

export interface FaceRecognitionOptions {
  /** Enable the whole system; false = camera + loop stopped */
  enabled: boolean;
  /** When true, camera stream is suspended (e.g. after inactivity). Detection resumes on next motion event. */
  suspended?: boolean;
  /** Detection interval in ms. Default 2000 — RPi-friendly. */
  intervalMs?: number;
  /** Face-match Euclidean distance. Default 0.55. Higher = more lenient. */
  matchDistance?: number;
  /** After a successful match, skip detection for this many ms. Default 30000. */
  inactivityMs?: number;
  /** Auto-logout: forget user after this many ms without a match. 0 = disabled. */
  autoLogoutMs?: number;
  /** Wake detection on Socket.io `motion-detected` events. Default false. */
  onMotionWakeup?: boolean;
}

export interface RecognizedUser {
  id: string;
  name: string;
  color: string;
}

export interface FaceRecognitionState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  recognizedUser: RecognizedUser | null;
  /** Camera is open and models are loaded */
  ready: boolean;
  error: string | null;
  /** Number of face descriptors loaded from server */
  descriptorsLoaded: number;
  /** Reset to generic (unauthenticated) wall */
  forget: () => void;
}

export function useFaceRecognition(opts: FaceRecognitionOptions): FaceRecognitionState {
  const {
    enabled,
    suspended = false,
    intervalMs = 2000,
    matchDistance = 0.55,
    inactivityMs = 30_000,
    autoLogoutMs = 0,
    onMotionWakeup = false,
  } = opts;

  const videoRef             = useRef<HTMLVideoElement | null>(null);
  const streamRef            = useRef<MediaStream | null>(null);
  const intervalRef          = useRef<number | null>(null);
  const lastSeenRef          = useRef<number>(0);
  const lastMotionRef        = useRef<number>(0);
  const motionCleanupRef     = useRef<(() => void) | null>(null);

  const [recognizedUser, setRecognizedUser] = useState<RecognizedUser | null>(null);
  const [ready, setReady]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const { data: descriptors = [] } = useQuery<FaceDescriptorEntry[]>({
    queryKey: ['face-descriptors'],
    queryFn: () => api.get('/profile/face-descriptors').then((r) => r.data),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  // ── Camera suspend / resume ────────────────────────────────────────────────
  // When `suspended` flips to true, stop the stream to release the camera.
  // When it flips back (motion woke us), the main effect restarts everything.
  useEffect(() => {
    if (!suspended) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [suspended]);

  // ── Main detection effect ──────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || suspended || descriptors.length === 0) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setReady(false);
      if (!enabled) setRecognizedUser(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // 1. Load models (browser-cached after first load)
        const faceapi = await import('@vladmandic/face-api');
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);
        if (cancelled) return;

        // 2. Build matcher from DB descriptors
        const grouped = new Map<string, { user: RecognizedUser; descriptors: Float32Array[] }>();
        for (const d of descriptors) {
          const arr = new Float32Array(d.descriptor);
          const entry = grouped.get(d.userId);
          if (entry) entry.descriptors.push(arr);
          else grouped.set(d.userId, { user: d.user, descriptors: [arr] });
        }
        const labeled = [...grouped.values()].map(({ user, descriptors: ds }) =>
          new faceapi.LabeledFaceDescriptors(user.id, ds),
        );
        const matcher  = new faceapi.FaceMatcher(labeled, matchDistance);
        const userMap  = new Map([...grouped.values()].map((g) => [g.user.id, g.user]));

        // 3. Open camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 320, height: 240 },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);

        // 4. Detection loop
        const detect = async () => {
          if (cancelled || !videoRef.current) return;

          // Motion-gated: only run for 10 s after last PIR event
          if (onMotionWakeup) {
            const sinceMotion = Date.now() - lastMotionRef.current;
            if (sinceMotion > 10_000) return;
          }

          // CPU save: skip if user was just seen
          if (Date.now() - lastSeenRef.current < inactivityMs) return;

          const detection = await faceapi
            .detectSingleFace(
              videoRef.current,
              new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }),
            )
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (!detection) {
            if (autoLogoutMs > 0 && lastSeenRef.current > 0) {
              if (Date.now() - lastSeenRef.current > autoLogoutMs) {
                setRecognizedUser(null);
                lastSeenRef.current = 0;
              }
            }
            return;
          }

          const best = matcher.findBestMatch(detection.descriptor);
          if (best.label !== 'unknown') {
            const u = userMap.get(best.label);
            if (u) {
              lastSeenRef.current = Date.now();
              setRecognizedUser((prev) => (prev?.id === u.id ? prev : u));
            }
          }
        };

        // Motion socket wakeup
        const handleMotion = () => {
          lastMotionRef.current = Date.now();
          detect();
        };
        const sock = getSocket();
        if (onMotionWakeup && sock) {
          sock.on('motion-detected', handleMotion);
          motionCleanupRef.current = () => sock.off('motion-detected', handleMotion);
        }

        window.setTimeout(detect, 500);
        intervalRef.current = window.setInterval(detect, intervalMs);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erkennung fehlgeschlagen');
          setReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      motionCleanupRef.current?.();
      motionCleanupRef.current = null;
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, suspended, descriptors.length, intervalMs, matchDistance, inactivityMs, autoLogoutMs, onMotionWakeup]);

  const forget = () => {
    setRecognizedUser(null);
    lastSeenRef.current = 0;
  };

  return { videoRef, recognizedUser, ready, error, descriptorsLoaded: descriptors.length, forget };
}
