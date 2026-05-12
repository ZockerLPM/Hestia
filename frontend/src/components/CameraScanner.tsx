import { useEffect, useRef, useState } from 'react';
import { X, Camera as CameraIcon } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export default function CameraScanner({ open, onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStarting(true);

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
        if (!back) {
          setError('Keine Kamera gefunden');
          setStarting(false);
          return;
        }
        if (!videoRef.current) return;
        controlsRef.current = await reader.decodeFromVideoDevice(
          back.deviceId,
          videoRef.current,
          (result, _err, controls) => {
            if (cancelled) {
              controls.stop();
              return;
            }
            if (result) {
              const code = result.getText();
              controls.stop();
              onScan(code);
              onClose();
            }
          },
        );
        setStarting(false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Kamera konnte nicht gestartet werden';
        setError(/permission|denied/i.test(msg) ? 'Kamera-Zugriff verweigert' : msg);
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onScan, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-medium flex items-center gap-2">
          <CameraIcon className="w-5 h-5" /> Barcode scannen
        </span>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10" aria-label="Schließen">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center">
        <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
        <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-32 border-2 border-white/70 rounded-xl pointer-events-none" />
        {starting && !error && (
          <p className="absolute bottom-20 inset-x-0 text-center text-white/80 text-sm">Kamera wird gestartet…</p>
        )}
        {error && (
          <div className="absolute inset-x-6 bottom-16 bg-red-500/90 text-white text-sm rounded-lg px-4 py-3 text-center">
            {error}
          </div>
        )}
      </div>

      <p className="text-center text-white/60 text-xs pb-6 px-4">
        Halte den Barcode mittig in den Rahmen. Auf Mobile wird automatisch die Rückkamera verwendet.
      </p>
    </div>
  );
}
