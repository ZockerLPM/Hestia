import { NavLink } from 'react-router-dom';
import { navItems } from './navItems';

export default function BottomTabBar() {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 flex justify-around"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 text-[10px] gap-0.5 transition-colors ${
              isActive ? 'text-primary-600' : 'text-gray-400 hover:text-gray-700'
            }`
          }
        >
          <Icon className="w-5 h-5" />
          <span className="font-medium">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
