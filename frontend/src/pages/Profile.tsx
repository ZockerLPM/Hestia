import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  User as UserIcon, MapPin, Briefcase, Cloud, Camera, Trash2, Train, Car, Bike, Footprints, Clock, Plus, X,
} from 'lucide-react';
import { api } from '../api/client';
import type { UserProfile, FaceDescriptorEntry, WorkShift } from '../api/types';
import { useAuthStore } from '../store/authStore';
import ShiftPatternEditor from '../components/ShiftPatternEditor';

const COMMUTE_MODES = [
  { value: 'transit', label: 'ÖV', icon: Train },
  { value: 'driving', label: 'Auto', icon: Car },
  { value: 'biking', label: 'Fahrrad', icon: Bike },
  { value: 'walking', label: 'Zu Fuß', icon: Footprints },
] as const;

export default function Profile() {
  const qc = useQueryClient();
  const { user: authUser } = useAuthStore();

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['profile-me'],
    queryFn: () => api.get('/profile/me').then((r) => r.data),
  });

  const { data: faces = [] } = useQuery<FaceDescriptorEntry[]>({
    queryKey: ['face-descriptors'],
    queryFn: () => api.get('/profile/face-descriptors').then((r) => r.data),
  });

  const { data: shifts = [] } = useQuery<WorkShift[]>({
    queryKey: ['shifts', 'me'],
    queryFn: () => api.get('/shifts').then((r) => r.data),
  });

  const saveProfile = useMutation({
    mutationFn: (patch: Partial<UserProfile>) => api.put('/profile/me', patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-me'] });
      toast.success('Profil gespeichert');
    },
  });

  const deleteFace = useMutation({
    mutationFn: (id: string) => api.delete(`/profile/face-descriptors/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['face-descriptors'] });
      toast.success('Gesicht entfernt');
    },
  });

  const ownFaces = faces.filter((f) => f.userId === authUser?.id);

  if (!profile) return <div className="card p-10 text-center text-gray-400">Lädt…</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <UserIcon className="w-5 h-5 text-primary-500" /> Profil & Personalisierung
        </h1>
      </div>

      <LocationCard
        title="Zuhause" icon={MapPin}
        lat={profile.homeLat} lng={profile.homeLng} label={profile.homeLabel}
        onSave={(loc) => saveProfile.mutate({ homeLat: loc.lat, homeLng: loc.lng, homeLabel: loc.label })}
        hint="Z.B. Heimatbahnhof oder Wohnadresse. Wird für Pendel-Anzeige und Wetter genutzt."
      />

      <LocationCard
        title="Arbeit" icon={Briefcase}
        lat={profile.workLat} lng={profile.workLng} label={profile.workLabel}
        onSave={(loc) => saveProfile.mutate({ workLat: loc.lat, workLng: loc.lng, workLabel: loc.label })}
        hint="Zielbahnhof oder Adresse für Pendel-Verbindungen."
      />

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Train className="w-4 h-4 text-primary-500" /> Pendel-Modus
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {COMMUTE_MODES.map((m) => {
            const active = profile.commuteMode === m.value;
            const Icon = m.icon;
            return (
              <button key={m.value}
                onClick={() => saveProfile.mutate({ commuteMode: m.value })}
                className={`py-3 rounded-lg text-sm font-medium flex flex-col items-center gap-1 transition-colors ${
                  active ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}>
                <Icon className="w-5 h-5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <LocationCard
        title="Wetter-Standort" icon={Cloud}
        lat={profile.weatherLat} lng={profile.weatherLng} label={null}
        onSave={(loc) => saveProfile.mutate({ weatherLat: loc.lat, weatherLng: loc.lng })}
        labelHidden
        hint="Wenn leer, wird der Zuhause-Standort genommen."
      />

      <ShiftsCard shifts={shifts} />

      <ShiftPatternEditor />

      <FacesCard
        ownFaces={ownFaces}
        onDelete={(id) => deleteFace.mutate(id)}
        userName={profile.name}
      />
    </div>
  );
}

// =========================== Location-Karte ===========================
function LocationCard({
  title, icon: Icon, lat, lng, label, onSave, hint, labelHidden = false,
}: {
  title: string;
  icon: React.ElementType;
  lat: number | null;
  lng: number | null;
  label: string | null;
  onSave: (l: { lat: number; lng: number; label: string }) => void;
  hint?: string;
  labelHidden?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    lat: lat?.toString() ?? '',
    lng: lng?.toString() ?? '',
    label: label ?? '',
  });

  useEffect(() => {
    if (!editing) {
      setForm({ lat: lat?.toString() ?? '', lng: lng?.toString() ?? '', label: label ?? '' });
    }
  }, [lat, lng, label, editing]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error('Standort nicht verfügbar');
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm({ ...form, lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }),
      (err) => toast.error(err.message),
    );
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary-500" /> {title}
        </h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-primary-600 hover:underline">
            Bearbeiten
          </button>
        )}
      </div>
      {hint && !editing && <p className="text-xs text-gray-400 mt-1">{hint}</p>}

      {!editing ? (
        <p className="mt-2 text-sm">
          {lat != null && lng != null ? (
            <>
              {!labelHidden && label && <strong>{label}</strong>}
              {!labelHidden && label && ' — '}
              <span className="text-gray-500">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
            </>
          ) : (
            <span className="text-gray-400 italic">Noch nicht gesetzt</span>
          )}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {!labelHidden && (
            <input className="input" placeholder="Bezeichnung (z.B. Hauptbahnhof Zürich)"
              value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Breitengrad"
              value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
            <input className="input" placeholder="Längengrad"
              value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
          </div>
          <div className="flex justify-between items-center">
            <button onClick={useCurrentLocation} className="text-xs text-primary-600 hover:underline">
              Aktuellen Standort übernehmen
            </button>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="btn-secondary text-xs px-3 py-1">Abbrechen</button>
              <button
                onClick={() => {
                  const la = parseFloat(form.lat);
                  const ln = parseFloat(form.lng);
                  if (Number.isNaN(la) || Number.isNaN(ln)) return toast.error('Ungültige Koordinaten');
                  onSave({ lat: la, lng: ln, label: form.label });
                  setEditing(false);
                }}
                className="btn-primary text-xs px-3 py-1">
                Speichern
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Tipp: Auf <a href="https://www.openstreetmap.org" target="_blank" rel="noreferrer"
              className="text-primary-600 underline">openstreetmap.org</a> Standort suchen, rechte Maustaste → "Adresse hier zeigen" → Koordinaten kopieren.
          </p>
        </div>
      )}
    </div>
  );
}

// =========================== Schichten ===========================
function ShiftsCard({ shifts }: { shifts: WorkShift[] }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ startsAt: '', endsAt: '', note: '' });

  const create = useMutation({
    mutationFn: () => api.post('/shifts', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      setAdding(false);
      setForm({ startsAt: '', endsAt: '', note: '' });
      toast.success('Schicht angelegt');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/shifts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });

  const upcoming = shifts.filter((s) => new Date(s.endsAt) >= new Date()).slice(0, 8);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary-500" /> Arbeitsschichten
        </h2>
        <button onClick={() => setAdding((v) => !v)} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
          <Plus className="w-3 h-3" /> Schicht
        </button>
      </div>

      {adding && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-2 mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Beginn</label>
              <input type="datetime-local" required className="input" value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </div>
            <div>
              <label className="label">Ende</label>
              <input type="datetime-local" required className="input" value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </div>
          </div>
          <input className="input" placeholder="Notiz (optional)"
            value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary text-xs px-3 py-1">Abbrechen</button>
            <button type="submit" className="btn-primary text-xs px-3 py-1">Speichern</button>
          </div>
        </form>
      )}

      {upcoming.length === 0 ? (
        <p className="text-sm text-gray-400">Keine kommenden Schichten.</p>
      ) : (
        <ul className="divide-y divide-gray-50 dark:divide-gray-800">
          {upcoming.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <div className="flex-1">
                <p className="font-medium">
                  {format(parseISO(s.startsAt), 'EEE d.M. HH:mm', { locale: de })}
                  {' – '}
                  {format(parseISO(s.endsAt), 'HH:mm')}
                </p>
                {s.note && <p className="text-xs text-gray-400">{s.note}</p>}
              </div>
              <button onClick={() => remove.mutate(s.id)} className="p-1 text-gray-300 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =========================== Gesichts-Registrierung ===========================
function FacesCard({ ownFaces, onDelete, userName }: {
  ownFaces: FaceDescriptorEntry[];
  onDelete: (id: string) => void;
  userName: string;
}) {
  const qc = useQueryClient();
  const [capturing, setCapturing] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCapturing(false);
  };

  const startCamera = async () => {
    setStreamError(null);
    setStatusMsg('Kamera startet…');
    setCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatusMsg('Schau in die Kamera, dann auf "Gesicht erfassen" tippen.');
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : 'Kamera konnte nicht gestartet werden');
      setCapturing(false);
    }
  };

  const capture = async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setStatusMsg('Modelle werden geladen…');
    try {
      const faceapi = await import('@vladmandic/face-api');
      // Modelle nur einmal laden — bei wiederholter Nutzung cached der Browser
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      setStatusMsg('Erkenne Gesicht…');
      const result = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!result) {
        setStatusMsg('Kein Gesicht erkannt. Bitte näher und besser ausleuchten.');
        setBusy(false);
        return;
      }

      const descriptor = Array.from(result.descriptor);
      await api.post('/profile/face-descriptors', {
        descriptor,
        label: `${ownFaces.length + 1}. Aufnahme`,
      });
      qc.invalidateQueries({ queryKey: ['face-descriptors'] });
      toast.success('Gesicht gespeichert');
      setStatusMsg('Gespeichert! Du kannst weitere Aufnahmen machen (verschiedene Winkel/Licht).');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erkennung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Camera className="w-4 h-4 text-primary-500" /> Wand-Erkennung
        </h2>
        {!capturing && (
          <button onClick={startCamera} className="btn-primary text-xs px-3 py-1">Gesicht hinzufügen</button>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-3">
        Wenn du dein Gesicht registrierst, zeigt das Wand-Dashboard automatisch deine persönlichen Inhalte
        (Pendel, Schichten, Wetter) wenn du davor stehst. Alle Daten bleiben lokal — nichts geht in die Cloud.
        2–3 Aufnahmen aus verschiedenen Winkeln verbessern die Trefferquote.
      </p>

      {capturing && (
        <div className="mb-3 space-y-2">
          <video ref={videoRef} className="w-full max-w-sm rounded-lg bg-black" muted playsInline />
          <p className="text-xs text-gray-500">{statusMsg}</p>
          <div className="flex gap-2">
            <button onClick={capture} disabled={busy} className="btn-primary text-sm">
              {busy ? 'Verarbeite…' : '📸 Gesicht erfassen'}
            </button>
            <button onClick={stopCamera} className="btn-secondary text-sm">Kamera aus</button>
          </div>
          {streamError && <p className="text-xs text-red-500">{streamError}</p>}
        </div>
      )}

      {ownFaces.length === 0 ? (
        <p className="text-sm text-gray-400">Noch keine Aufnahmen.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {ownFaces.map((f, idx) => (
            <div key={f.id}
              className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm">
              <Camera className="w-3.5 h-3.5 text-primary-500" />
              <span>{f.label || `Aufnahme ${idx + 1}`}</span>
              <span className="text-xs text-gray-400">
                {format(parseISO((f as any).createdAt ?? new Date().toISOString()), 'd.M.', { locale: de })}
              </span>
              <button onClick={() => onDelete(f.id)} className="text-gray-300 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-3">
        <strong>Hinweis zum {userName}-Setup:</strong> Auf dem Wandtablet muss <code>/models/</code> die
        face-api.js-Modelldateien enthalten (werden mit der App ausgeliefert).
      </p>
    </div>
  );
}
