import { useQuery } from '@tanstack/react-query';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { de } from 'date-fns/locale';
import { Cloud, Train, Car, Clock, MapPin, AlertTriangle } from 'lucide-react';
import { api } from '../../api/client';
import {
  fetchWeather, fetchTransit, fetchTraffic, weatherCodeIcon,
  type WeatherData, type TransitConnection, type TrafficData,
} from '../../api/external';
import type { UserProfile, WorkShift } from '../../api/types';
import MoodCheckIn from './MoodCheckIn';

interface Props {
  userId: string;
  userName: string;
  userColor: string;
}

export default function PersonalPanel({ userId, userName, userColor }: Props) {
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['profile', userId],
    queryFn: () => api.get('/profile/me').then((r) => r.data),
    enabled: !!userId,
  });

  const { data: shifts = [] } = useQuery<WorkShift[]>({
    queryKey: ['shifts', userId, 'upcoming'],
    queryFn: () => api.get('/shifts?upcoming=true').then((r) => r.data),
    enabled: !!userId,
    refetchInterval: 5 * 60 * 1000,
  });

  // Wetter
  const weatherLat = profile?.weatherLat ?? profile?.homeLat ?? null;
  const weatherLng = profile?.weatherLng ?? profile?.homeLng ?? null;
  const { data: weather } = useQuery<WeatherData>({
    queryKey: ['weather', weatherLat, weatherLng],
    queryFn: () => fetchWeather(weatherLat!, weatherLng!),
    enabled: weatherLat != null && weatherLng != null,
    refetchInterval: 15 * 60 * 1000,
  });

  // Pendel — abhängig vom Modus
  const useTransit = profile?.commuteMode === 'transit';
  const useDriving = profile?.commuteMode === 'driving';
  const hasHomeWork = profile?.homeLabel && profile?.workLabel;

  const { data: transit } = useQuery<{ connections: TransitConnection[] }>({
    queryKey: ['transit', profile?.homeLabel, profile?.workLabel],
    queryFn: () => fetchTransit(profile!.homeLabel!, profile!.workLabel!),
    enabled: !!(useTransit && hasHomeWork),
    refetchInterval: 60 * 1000,
  });

  const { data: traffic } = useQuery<TrafficData>({
    queryKey: ['traffic', profile?.homeLat, profile?.workLat],
    queryFn: () => fetchTraffic(profile!.homeLat!, profile!.homeLng!, profile!.workLat!, profile!.workLng!),
    enabled: !!(useDriving && profile?.homeLat != null && profile?.workLat != null),
    refetchInterval: 3 * 60 * 1000,
  });

  const nextShift = shifts[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-1">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
          style={{ backgroundColor: userColor }}
        >
          {userName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Willkommen zurück</p>
          <p className="text-xl font-bold">{userName}</p>
        </div>
      </div>

      <MoodCheckIn userId={userId} />

      {weather && (
        <WeatherCard data={weather} cityLabel={profile?.homeLabel ?? ''} />
      )}

      {useTransit && hasHomeWork && (
        <TransitCard
          fromLabel={profile!.homeLabel!}
          toLabel={profile!.workLabel!}
          connections={transit?.connections ?? []}
        />
      )}

      {useDriving && profile?.homeLat != null && profile?.workLat != null && (
        <TrafficCard data={traffic} fromLabel={profile.homeLabel ?? ''} toLabel={profile.workLabel ?? ''} />
      )}

      {nextShift && <NextShiftCard shift={nextShift} />}

      {!profile?.homeLat && !nextShift && (
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <p className="text-sm text-gray-400">
            Tipp: Im <strong className="text-gray-200">Profil</strong> Pendel-Strecke und Wetter-Standort
            eintragen, damit hier persönliche Daten erscheinen.
          </p>
        </div>
      )}
    </div>
  );
}

function WeatherCard({ data, cityLabel }: { data: WeatherData; cityLabel: string }) {
  const today = {
    code: data.daily.weather_code[0],
    max: data.daily.temperature_2m_max[0],
    min: data.daily.temperature_2m_min[0],
    precip: data.daily.precipitation_probability_max[0],
  };
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center gap-2 mb-2 text-gray-400 text-xs uppercase tracking-wide">
        <Cloud className="w-4 h-4" /> Wetter {cityLabel && `· ${cityLabel}`}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-5xl">{weatherCodeIcon(data.current.weather_code)}</span>
        <div>
          <p className="text-3xl font-bold tabular-nums">{Math.round(data.current.temperature_2m)}°</p>
          <p className="text-xs text-gray-400">
            gefühlt {Math.round(data.current.apparent_temperature)}° · max {Math.round(today.max)}° / min {Math.round(today.min)}°
            {today.precip > 30 && ` · ${today.precip}% Regen`}
          </p>
        </div>
      </div>
      {/* 2-Tages-Vorschau */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-800">
        {data.daily.time.slice(1, 3).map((day, i) => (
          <div key={day} className="flex-1 text-center">
            <p className="text-xs text-gray-500">{format(parseISO(day), 'EEE', { locale: de })}</p>
            <p className="text-2xl mt-0.5">{weatherCodeIcon(data.daily.weather_code[i + 1])}</p>
            <p className="text-xs text-gray-400 tabular-nums">
              {Math.round(data.daily.temperature_2m_max[i + 1])}°/{Math.round(data.daily.temperature_2m_min[i + 1])}°
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransitCard({ fromLabel, toLabel, connections }: {
  fromLabel: string; toLabel: string; connections: TransitConnection[];
}) {
  const next = connections.slice(0, 3);
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center gap-2 mb-2 text-gray-400 text-xs uppercase tracking-wide">
        <Train className="w-4 h-4" /> Nächste Verbindungen
      </div>
      <p className="text-sm text-gray-500 mb-3 flex items-center gap-1.5">
        <MapPin className="w-3 h-3" /> {fromLabel} → {toLabel}
      </p>
      {next.length === 0 ? (
        <p className="text-sm text-gray-500">Keine Verbindungen gefunden.</p>
      ) : (
        <ul className="space-y-2">
          {next.map((c, i) => {
            const dep = c.from.departure ? parseISO(c.from.departure) : null;
            const minToDeparture = dep ? differenceInMinutes(dep, new Date()) : null;
            const isImminent = minToDeparture !== null && minToDeparture <= 10;
            return (
              <li key={i} className="flex items-baseline gap-3 text-base">
                <span className={`tabular-nums font-bold ${isImminent ? 'text-amber-400' : 'text-gray-200'}`}>
                  {dep ? format(dep, 'HH:mm') : '—'}
                </span>
                {c.from.delay > 0 && <span className="text-xs text-red-400">+{c.from.delay}'</span>}
                <span className="text-xs text-gray-500 flex-1">
                  {c.duration && parseDuration(c.duration)}
                  {(c.transfers ?? 0) > 0 && ` · ${c.transfers} Umstieg${c.transfers === 1 ? '' : 'e'}`}
                  {c.from.platform && ` · Gl. ${c.from.platform}`}
                </span>
                {minToDeparture !== null && minToDeparture >= 0 && (
                  <span className={`text-xs tabular-nums ${isImminent ? 'text-amber-400' : 'text-gray-500'}`}>
                    in {minToDeparture}'
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TrafficCard({ data, fromLabel, toLabel }: {
  data: TrafficData | undefined; fromLabel: string; toLabel: string;
}) {
  if (!data || !data.enabled) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide">
          <Car className="w-4 h-4" /> Verkehr
        </div>
        <p className="text-sm text-gray-500 mt-2">Verkehrs-API nicht konfiguriert (TomTom-Key fehlt).</p>
      </div>
    );
  }

  const durationMin = Math.round((data.durationSec ?? 0) / 60);
  const delayMin = Math.round((data.delaySec ?? 0) / 60);
  const congestionColor =
    data.congestion === 'heavy' ? 'text-red-400'
    : data.congestion === 'moderate' ? 'text-amber-400'
    : 'text-green-400';
  const congestionLabel =
    data.congestion === 'heavy' ? 'Stark verzögert'
    : data.congestion === 'moderate' ? 'Leicht verzögert'
    : 'Freie Fahrt';

  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center gap-2 mb-2 text-gray-400 text-xs uppercase tracking-wide">
        <Car className="w-4 h-4" /> Verkehr
      </div>
      <p className="text-sm text-gray-500 mb-3 flex items-center gap-1.5">
        <MapPin className="w-3 h-3" /> {fromLabel} → {toLabel}
      </p>
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold tabular-nums">{durationMin}</span>
        <span className="text-sm text-gray-500">Minuten</span>
        {delayMin > 0 && (
          <span className="text-sm text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> +{delayMin} min Stau
          </span>
        )}
      </div>
      <p className={`text-xs mt-2 ${congestionColor}`}>{congestionLabel}</p>
      {data.distanceM != null && (
        <p className="text-xs text-gray-500 mt-1">{(data.distanceM / 1000).toFixed(1)} km</p>
      )}
    </div>
  );
}

function NextShiftCard({ shift }: { shift: WorkShift }) {
  const start = parseISO(shift.startsAt);
  const end = parseISO(shift.endsAt);
  const minToStart = differenceInMinutes(start, new Date());
  const isActive = minToStart < 0 && differenceInMinutes(end, new Date()) > 0;
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center gap-2 mb-2 text-gray-400 text-xs uppercase tracking-wide">
        <Clock className="w-4 h-4" /> {isActive ? 'Aktuell' : 'Nächste Schicht'}
      </div>
      <p className="text-xl font-bold">
        {format(start, 'EEE d.M.', { locale: de })} · {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
      </p>
      {!isActive && minToStart < 24 * 60 && minToStart > 0 && (
        <p className="text-xs text-gray-500 mt-1">in {Math.floor(minToStart / 60)}h {minToStart % 60}min</p>
      )}
      {shift.note && <p className="text-xs text-gray-400 mt-1">{shift.note}</p>}
    </div>
  );
}

function parseDuration(d: string): string {
  // Format: "00d00:25:00"
  const m = d.match(/(\d+)d(\d{2}):(\d{2}):/);
  if (!m) return d;
  const days = parseInt(m[1], 10);
  const hours = parseInt(m[2], 10);
  const minutes = parseInt(m[3], 10);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}
