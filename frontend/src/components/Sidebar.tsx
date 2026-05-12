import { NavLink } from 'react-router-dom';
import { LogOut, Home } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { navItems } from './navItems';
import ThemeToggle from './ThemeToggle';

export default function Sidebar() {
  const { user, logout } = useAuthStore();

  return (
    <aside className="hidden lg:flex static inset-y-0 left-0 z-30 w-64 bg-gray-900 text-white flex-col">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
        <div className="w-9 h-9 bg-primary-500 rounded-lg flex items-center justify-center">
          <Home className="w-5 h-5" />
        </div>
        <div>
          <p className="font-bold text-lg leading-none">Hestia</p>
          <p className="text-xs text-gray-400">Haushaltsverwaltung</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {user && (
        <div className="p-4 border-t border-gray-800 space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ backgroundColor: user.color }}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <ThemeToggle />
        </div>
      )}
    </aside>
  );
}
