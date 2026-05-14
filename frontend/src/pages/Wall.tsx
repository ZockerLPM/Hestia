import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { Package, Settings, SlidersHorizontal, User as UserIcon, Eye, EyeOff } from 'lucide-react';

import { api } from '../api/client';
import type { User } from '../api/types';
import { useWallData } from '../wall/useWallData';
import { useWallScreensaver } from '../hooks/useWallScreensaver';
import { useFaceRecognition } from '../hooks/useFaceRecognition';

import WallPantryEntry from '../components/wall/WallPantryEntry';
import PersonalPanel from '../components/wall/PersonalPanel';
import WallConfigEditor from '../components/wall/WallConfigEditor';
import MoodCheckIn from '../components/wall/MoodCheckIn';

import TasksCard from '../components/wall/cards/TasksCard';
import EventsCard from '../components/wall/cards/EventsCard';
import MealsCard from '../components/wall/cards/MealsCard';
import ShoppingCard from '../components/wall/cards/ShoppingCard';
import ExpiringCard from '../components/wall/cards/ExpiringCard';
import UpcomingTasksCard from '../components/wall/cards/UpcomingTasksCard';
import BudgetCard from '../components/wall/cards/BudgetCard';
import CountdownCard from '../components/wall/cards/CountdownCard';

import type { WallCardId } from '../wall/types';

export default function Wall() {
  const [now, setNow] = useState(new Date());
  const [showPantryEntry, setShowPantryEntry] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  // Face-Recognition standardmäßig AUS — bei Bedarf manuell aktivieren
  // (war früher default an, hat aber bei kaputter/fehlender Cam zu
  // dauerhaftem "Starten…"/"Kamera-Fehler"-Status geführt).
  const [faceEnabled, setFaceEnabled] = useState(
    () => localStorage.getItem('hestia-wall-face') === 'on',
  );

  // Manuell ausgewählter Wand-User für PersonalPanel (Touch-Switch im Header).
  // null = kein Panel anzeigen. Wird vom Face-Recognition-Match überschrieben,
  // wenn die Cam jemanden erkennt.
  const [manualWallUserId, setManualWallUserId] = useState<string | null>(
    () => localStorage.getItem('hestia-wall-user-id'),
  );

  const setManualWallUser = (id: string | null) => {
    setManualWallUserId(id);
    if (id) localStorage.setItem('hestia-wall-user-id', id);
    else localStorage.removeItem('hestia-wall-user-id');
  };

  const toggleFace = () => {
    const next = !faceEnabled;
    setFaceEnabled(next);
    localStorage.setItem('hestia-wall-face', next ? 'on' : 'off');
  };

  // Alle Haushaltsmember für den User-Switcher
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ['users', 'household'],
    queryFn: () => api.get('/users').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const {
    todayTasks, upcomingTasks,
    todayEvents, upcomingEvents,
    openShopping, defaultList,
    todayMeals,
    expiring,
    budgets,
    countdownEvents,
    wallConfig,
    toggleTask, addTask,
    toggleShopping, addShopping,
    cookMeal,
    saveWallConfig,
  } = useWallData();

  const screensaver = useWallScreensaver({
    screensaverMs: wallConfig.screensaverMs ?? 0,
    cameraSleepMs: wallConfig.cameraSleepMs ?? 0,
  });

  const face = useFaceRecognition({
    enabled: faceEnabled,
    suspended: screensaver.isCameraSleeping,
    autoLogoutMs: 45_000,
    onMotionWakeup: true,
  });

  useEffect(() => {
    document.documentElement.classList.add('dark');
    const originalTitle = document.title;
    document.title = 'Hestia — Wand';
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(tick);
      document.title = originalTitle;
    };
  }, []);

  const bgColor = wallConfig.bgColor ?? '#030712';
  const showSec = wallConfig.showSeconds ?? false;

  const activeCards = [...(wallConfig.cards.length ? wallConfig.cards : [])]
    .filter((c) => c.enabled)
    .sort((a, b) => a.order - b.order);

  // User-Switcher: ausgenommene User (z.B. Kiosk-Account) filtern.
  // Reihenfolge bleibt stabil = wie vom Backend geliefert.
  const excludedIds = new Set(wallConfig.excludedUserIds ?? []);
  const householdUsers = allUsers.filter((u) => !excludedIds.has(u.id));

  // Cycle: null (Niemand) → user[0] → user[1] → … → null
  const cycleWallUser = () => {
    if (householdUsers.length === 0) return;
    const idx = manualWallUserId
      ? householdUsers.findIndex((u) => u.id === manualWallUserId)
      : -1;
    const nextIdx = idx + 1;
    if (nextIdx >= householdUsers.length) setManualWallUser(null);
    else setManualWallUser(householdUsers[nextIdx].id);
  };

  // Wenn aktuell ausgewählter User excluded wurde → automatisch leeren
  useEffect(() => {
    if (manualWallUserId && excludedIds.has(manualWallUserId)) {
      setManualWallUser(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallConfig.excludedUserIds]);

  const manualWallUser = householdUsers.find((u) => u.id === manualWallUserId) ?? null;

  function renderCard(id: WallCardId, wide: boolean) {
    switch (id) {
      case 'tasks':
        return (
          <TasksCard
            key="tasks"
            tasks={todayTasks}
            wide={wide}
            onToggle={toggleTask}
            onAdd={addTask}
          />
        );
      case 'events':
        return (
          <EventsCard
            key="events"
            todayEvents={todayEvents}
            upcomingEvents={upcomingEvents}
            wide={wide}
          />
        );
      case 'meals':
        return (
          <MealsCard
            key="meals"
            meals={todayMeals}
            wide={wide}
            onCook={cookMeal}
          />
        );
      case 'shopping':
        return (
          <ShoppingCard
            key="shopping"
            items={openShopping}
            hasDefaultList={!!defaultList}
            wide={wide}
            onToggle={toggleShopping}
            onAdd={addShopping}
          />
        );
      case 'expiring':
        return <ExpiringCard key="expiring" items={expiring} wide={wide} />;
      case 'upcoming-tasks':
        return <UpcomingTasksCard key="upcoming-tasks" tasks={upcomingTasks} wide={wide} />;
      case 'budget':
        return <BudgetCard key="budget" budgets={budgets} wide={wide} />;
      case 'countdown':
        return <CountdownCard key="countdown" events={countdownEvents} wide={wide} />;
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen text-gray-100 p-2 sm:p-3 xl:p-6" style={{ backgroundColor: bgColor }}>

      {/* Screensaver overlay */}
      {screensaver.isScreensaverActive && (
        <div
          className="fixed inset-0 z-50 bg-black cursor-pointer"
          onClick={screensaver.wake}
          aria-label="Bildschirm aktivieren"
        />
      )}

      {/* Mood check-in (once per day, dismissible) */}
      <MoodCheckIn />

      {/* HEADER — kompakt auf 800x480, bei xl/2xl-Screens groß und prominent */}
      <div className="flex items-end justify-between mb-2 sm:mb-3 xl:mb-6 gap-2">
        <div className="min-w-0">
          <div className="text-3xl sm:text-5xl lg:text-7xl xl:text-8xl font-bold tabular-nums tracking-tight leading-none">
            {format(now, showSec ? 'HH:mm:ss' : 'HH:mm')}
          </div>
          <div className="text-xs sm:text-base lg:text-xl xl:text-2xl text-gray-400 mt-1 xl:mt-2 truncate">
            {format(now, 'EEEE, d. MMMM yyyy', { locale: de })}
          </div>
        </div>

        <div className="flex gap-1 sm:gap-2 shrink-0">
          <button
            onClick={() => setShowPantryEntry(true)}
            className="bg-primary-500 hover:bg-primary-600 text-white px-2.5 py-2 xl:px-5 xl:py-3 rounded-lg xl:rounded-xl text-xs sm:text-sm xl:text-lg font-semibold flex items-center gap-1.5 xl:gap-2"
          >
            <Package className="w-4 h-4 xl:w-5 xl:h-5" />
            <span className="hidden sm:inline">Einkauf eintragen</span>
          </button>

          <button
            onClick={() => setShowConfig(true)}
            title="Dashboard anpassen"
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-2 xl:px-4 xl:py-3 rounded-lg xl:rounded-xl flex items-center"
          >
            <SlidersHorizontal className="w-4 h-4 xl:w-5 xl:h-5" />
          </button>

          {/* User-Switcher: Tap cyclet durch Haushaltsmember + "Niemand".
              Zeigt Avatar (Initiale + Color) des aktuell ausgewählten Users
              oder ein generisches Icon, wenn keiner gewählt ist. */}
          <button
            onClick={cycleWallUser}
            title={
              manualWallUser
                ? `${manualWallUser.name} angezeigt — tippen für nächsten`
                : 'Persönliches Panel anzeigen — tippen zum Auswählen'
            }
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-2 xl:px-4 xl:py-3 rounded-lg xl:rounded-xl flex items-center"
          >
            {manualWallUser ? (
              <span
                className="w-6 h-6 xl:w-7 xl:h-7 rounded-full flex items-center justify-center text-xs xl:text-sm font-bold text-white"
                style={{ backgroundColor: manualWallUser.color }}
              >
                {manualWallUser.name.charAt(0).toUpperCase()}
              </span>
            ) : (
              <UserIcon className="w-4 h-4 xl:w-5 xl:h-5" />
            )}
          </button>

          {/* Face-Recognition Toggle — nur sichtbar wenn Cam-Hardware vorhanden */}
          <button
            onClick={toggleFace}
            title={faceEnabled ? 'Gesichtserkennung deaktivieren' : 'Gesichtserkennung aktivieren'}
            className={`px-2.5 py-2 xl:px-4 xl:py-3 rounded-lg xl:rounded-xl flex items-center ${
              faceEnabled ? 'bg-gray-800 text-gray-200' : 'bg-gray-900 text-gray-500'
            }`}
          >
            {faceEnabled ? <Eye className="w-4 h-4 xl:w-5 xl:h-5" /> : <EyeOff className="w-4 h-4 xl:w-5 xl:h-5" />}
          </button>

          {face.recognizedUser && (
            <button
              onClick={face.forget}
              title="Erkennung zurücksetzen"
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-2 xl:px-4 xl:py-3 rounded-lg xl:rounded-xl flex items-center"
            >
              <UserIcon className="w-4 h-4 xl:w-5 xl:h-5" />
            </button>
          )}

          <Link
            to="/"
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-2 xl:px-4 xl:py-3 rounded-lg xl:rounded-xl flex items-center"
          >
            <Settings className="w-4 h-4 xl:w-5 xl:h-5" />
          </Link>
        </div>
      </div>

      {/* Hidden video for face detection */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <video ref={face.videoRef as any} className="hidden" muted playsInline autoPlay />

      {/* Face detection status indicator */}
      {faceEnabled && (
        <div className="fixed bottom-3 left-3 text-xs text-gray-600 flex items-center gap-1.5 pointer-events-none">
          <span className={`w-1.5 h-1.5 rounded-full ${
            face.recognizedUser ? 'bg-green-400'
            : screensaver.isCameraSleeping ? 'bg-gray-700'
            : face.ready ? 'bg-amber-400 animate-pulse'
            : 'bg-gray-600'
          }`} />
          {screensaver.isCameraSleeping
            ? 'Kamera pausiert'
            : face.error
              ? 'Kamera-Fehler'
              : face.descriptorsLoaded === 0
                ? 'Keine Gesichter registriert'
                : face.recognizedUser
                  ? `${face.recognizedUser.name} erkannt`
                  : face.ready
                    ? 'Suche…'
                    : 'Starte…'}
        </div>
      )}

      {/* GRID — optional PersonalPanel on the left.
          Face-Recognition hat Vorrang (wenn jemand erkannt wird), sonst
          der manuell ausgewählte Wand-User. */}
      {(() => {
        const panelUser = face.recognizedUser ?? manualWallUser;
        return (
      <div className={`grid gap-2 sm:gap-3 xl:gap-4 ${
        panelUser ? 'grid-cols-1 xl:grid-cols-[340px_1fr]' : 'grid-cols-1'
      }`}>
        {panelUser && (
          <PersonalPanel
            userId={panelUser.id}
            userName={panelUser.name}
            userColor={panelUser.color}
          />
        )}

        {/* Auf 800x480 (md) eine Spalte, ab sm zwei, ab xl drei — passt
            für 7"-Touch-Displays ohne die Karten zu eng zu quetschen. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3 xl:gap-4">
          {activeCards.map((cfg) =>
            renderCard(cfg.id as WallCardId, cfg.wide ?? false),
          )}
        </div>
      </div>
        );
      })()}

      {/* Modals */}
      <WallPantryEntry open={showPantryEntry} onClose={() => setShowPantryEntry(false)} />

      {showConfig && (
        <WallConfigEditor
          config={wallConfig}
          onSave={(cfg) => { saveWallConfig(cfg); setShowConfig(false); }}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
}
