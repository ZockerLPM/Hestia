import { Outlet, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomTabBar from './BottomTabBar';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { usePwaUpdate } from '../hooks/usePwaUpdate';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useAuthStore } from '../store/authStore';
import { LogOut, WifiOff } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  useRealtimeSync();
  usePwaUpdate();
  const { offline, pending } = useOfflineStatus();
  const { user, logout } = useAuthStore();

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header
          className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
        >
          <span className="font-bold text-primary-600 text-lg">🏠 Hestia</span>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            {user && (
              <>
                <Link
                  to="/profile"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: user.color }}
                  aria-label="Profil"
                >
                  {user.name.charAt(0).toUpperCase()}
                </Link>
                <button
                  onClick={logout}
                  className="p-1.5 text-gray-400 hover:text-gray-700"
                  aria-label="Abmelden"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </header>

        {(offline || pending > 0) && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            {offline
              ? `Offline${pending > 0 ? ` — ${pending} Änderung${pending > 1 ? 'en' : ''} in Warteschlange` : ' — Änderungen werden später gesendet'}`
              : `${pending} Änderung${pending > 1 ? 'en' : ''} werden synchronisiert…`}
          </div>
        )}

        <main className="flex-1 overflow-auto p-4 md:p-6 pb-20 lg:pb-6">
          <Outlet />
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
