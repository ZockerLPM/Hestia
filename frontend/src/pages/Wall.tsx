import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { Package, Settings, SlidersHorizontal, User as UserIcon, Eye, EyeOff } from 'lucide-react';

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
  const [faceEnabled, setFaceEnabled] = useState(
    () => localStorage.getItem('hestia-wall-face') !== 'off',
  );

  const toggleFace = () => {
    const next = !faceEnabled;
    setFaceEnabled(next);
    localStorage.setItem('hestia-wall-face', next ? 'on' : 'off');
  };

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
    <div className="min-h-screen text-gray-100 p-6" style={{ backgroundColor: bgColor }}>

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

      {/* HEADER */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-7xl lg:text-8xl font-bold tabular-nums tracking-tight">
            {format(now, showSec ? 'HH:mm:ss' : 'HH:mm')}
          </div>
          <div className="text-xl lg:text-2xl text-gray-400 mt-2">
            {format(now, 'EEEE, d. MMMM yyyy', { locale: de })}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowPantryEntry(true)}
            className="bg-primary-500 hover:bg-primary-600 text-white px-5 py-3 rounded-xl text-lg font-semibold flex items-center gap-2"
          >
            <Package className="w-5 h-5" /> Einkauf eintragen
          </button>

          <button
            onClick={() => setShowConfig(true)}
            title="Dashboard anpassen"
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-3 rounded-xl flex items-center gap-2"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>

          <button
            onClick={toggleFace}
            title={faceEnabled ? 'Gesichtserkennung deaktivieren' : 'Gesichtserkennung aktivieren'}
            className={`px-4 py-3 rounded-xl flex items-center gap-2 ${
              faceEnabled ? 'bg-gray-800 text-gray-200' : 'bg-gray-900 text-gray-500'
            }`}
          >
            {faceEnabled ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </button>

          {face.recognizedUser && (
            <button
              onClick={face.forget}
              title="Generisches Interface anzeigen"
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-3 rounded-xl flex items-center gap-2"
            >
              <UserIcon className="w-5 h-5" />
            </button>
          )}

          <Link
            to="/"
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-3 rounded-xl flex items-center gap-2"
          >
            <Settings className="w-5 h-5" />
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

      {/* GRID — optional PersonalPanel on the left */}
      <div className={`grid gap-4 ${
        face.recognizedUser ? 'grid-cols-1 lg:grid-cols-[340px_1fr]' : 'grid-cols-1'
      }`}>
        {face.recognizedUser && (
          <PersonalPanel
            userId={face.recognizedUser.id}
            userName={face.recognizedUser.name}
            userColor={face.recognizedUser.color}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeCards.map((cfg) =>
            renderCard(cfg.id as WallCardId, cfg.wide ?? false),
          )}
        </div>
      </div>

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
