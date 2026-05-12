import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { api } from './api/client';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Finance from './pages/Finance';
import Shopping from './pages/Shopping';
import Pantry from './pages/Pantry';
import Tasks from './pages/Tasks';
import Calendar from './pages/Calendar';
import Recipes from './pages/Recipes';
import MealPlan from './pages/MealPlan';
import Stats from './pages/Stats';
import Wall from './pages/Wall';
import Profile from './pages/Profile';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { token, setAuth, logout } = useAuthStore();

  useEffect(() => {
    if (!token) return;
    api.get('/auth/me').then((res) => setAuth(res.data, token)).catch(logout);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/wall" element={<RequireAuth><Wall /></RequireAuth>} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="finance" element={<Finance />} />
          <Route path="shopping" element={<Shopping />} />
          <Route path="pantry" element={<Pantry />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="recipes" element={<Recipes />} />
          <Route path="meal-plan" element={<MealPlan />} />
          <Route path="stats" element={<Stats />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
