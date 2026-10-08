import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'recording' | 'stopping';

export interface UseAudioRecorder {
  status: Status;
  durationMs: number;
  level: number; // 0-100, smoothed RMS of the mic input
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
  cancel: () => void;
}

/**
 * Browser MediaRecorder hook with timer + auto-stop.
 * Returns a Blob (typically audio/webm or audio/ogg+opus depending on browser).
 */
export function useAudioRecorder(maxDurationMs: number = 30_000): UseAudioRecorder {
  const [status, setStatus] = useState<Status>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const smoothedRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (tickerRef.current) window.clearInterval(tickerRef.current);
      if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { sourceRef.current?.disconnect(); } catch { /* noop */ }
      try { analyserRef.current?.disconnect(); } catch { /* noop */ }
      audioCtxRef.current?.close().catch(() => { /* noop */ });
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopMeter = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    try { analyserRef.current?.disconnect(); } catch { /* noop */ }
    sourceRef.current = null;
    analyserRef.current = null;
    dataRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { /* noop */ });
      audioCtxRef.current = null;
    }
    smoothedRef.current = 0;
    setLevel(0);
  };

  const startMeter = (stream: MediaStream) => {
    const Ctx: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    // Defensive resume for browsers that start contexts suspended.
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024; // 512-sample time-domain buffer is plenty for RMS
    analyser.smoothingTimeConstant = 0; // we smooth manually
    source.connect(analyser);
    // NOTE: do NOT connect analyser to ctx.destination — would loop mic to speakers.

    sourceRef.current = source;
    analyserRef.current = analyser;
    const buf = new Uint8Array(analyser.fftSize);
    dataRef.current = buf;

    let lastEmit = 0;
    const FRAME_MS = 33; // ~30fps
    const tick = (t: number) => {
      const a = analyserRef.current;
      const d = dataRef.current;
      if (!a || !d) return; // unmounted/stopped
      a.getByteTimeDomainData(d as Uint8Array<ArrayBuffer>);
      // RMS over the waveform; samples are 0-255 with 128 == silence.
      let sumSq = 0;
      for (let i = 0; i < d.length; i++) {
        const v = (d[i] - 128) / 128; // -1..1
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / d.length); // 0..1 (typically 0..~0.4 for voice)
      // Map to 0-100 with a little gain so normal speech reaches mid-range.
      const raw = Math.min(100, rms * 200);
      // Asymmetric smoothing: fast attack, slow decay -> bars feel responsive but don't strobe.
      const prev = smoothedRef.current;
      const next = raw > prev ? raw : prev * 0.85 + raw * 0.15;
      smoothedRef.current = next;

      if (t - lastEmit >= FRAME_MS) {
        lastEmit = t;
        setLevel(Math.round(next));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const cleanupStream = () => {
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickerRef.current) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  };

  const start = async () => {
    setError(null);
    setDurationMs(0);
    chunksRef.current = [];

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer webm/opus first — Chrome/Edge/Firefox desktop mux it reliably.
      // Chrome on Windows returns false for audio/ogg;codecs=opus, so listing
      // it first caused us to fall through to weird container choices.
      // audio/mp4 added for Safari/iOS which can't mux webm.
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
        'audio/mp4',
        '',
      ];
      const supported = candidates.find(
        (m) => !m || (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)),
      );
      const mime = supported || '';
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current = recorder;
      // CRITICAL: 1000ms timeslice forces the muxer to flush a complete WebM
      // cluster every second. Without this, a stop() that races the first
      // cluster write produces a header-only blob (~200-2000 bytes) — that's
      // the "15 sec recording but says too short" bug.
      recorder.start(1000);
      startedAtRef.current = Date.now();
      setStatus('recording');
      startMeter(stream);

      tickerRef.current = window.setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current);
      }, 100);

      // Route auto-stop through stop() so it gets the same requestData()
      // + deferred-flush treatment as a manual stop.
      autoStopRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          void stop();
        }
      }, maxDurationMs);
    } catch (err: any) {
      setError(err?.message || 'Microphone access denied');
      setStatus('idle');
      cleanupStream();
    }
  };

  const stop = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== 'recording') {
        cleanupStream();
        setStatus('idle');
        resolve(null);
        return;
      }
      setStatus('stopping');

      recorder.onstop = () => {
        // Defer one tick: in some Chrome builds a trailing dataavailable
        // is queued AFTER onstop. setTimeout(0) lets that microtask drain
        // so we don't lose the final cluster.
        setTimeout(() => {
          const type = recorder.mimeType || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type });
          cleanupStream();
          setStatus('idle');
          // Header-only blobs (~200-2000 bytes) mean the muxer never flushed
          // a real cluster — surface as null + error so the UI can prompt retry.
          if (blob.size < 1024) {
            setError('Recording was empty — please try again');
            resolve(null);
          } else {
            resolve(blob);
          }
        }, 0);
      };

      // Force a final muxer flush before stop. requestData() synchronously
      // queues a dataavailable for whatever's in the tail buffer.
      try { recorder.requestData(); } catch { /* not all UAs implement; safe to ignore */ }
      recorder.stop();
    });
  };

  const cancel = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = null;
      try { recorder.stop(); } catch { /* noop */ }
    }
    chunksRef.current = [];
    cleanupStream();
    setStatus('idle');
    setDurationMs(0);
  };

  return { status, durationMs, level, error, start, stop, cancel };
}
