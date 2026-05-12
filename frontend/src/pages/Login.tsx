import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const { token, setAuth } = useAuthStore();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', color: '#6366f1' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = tab === 'login' ? '/auth/login' : '/auth/register';
      const payload = tab === 'login'
        ? { email: form.email, password: form.password }
        : form;
      const { data } = await api.post(url, payload);
      setAuth(data.user, data.token);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Fehler beim Anmelden');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Home className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Hestia</h1>
          <p className="text-gray-500 text-sm">Euer digitaler Haushalt</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'login' ? 'Anmelden' : 'Registrieren'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div>
                <label className="label">Name</label>
                <input className="input" placeholder="Dein Name" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
            )}
            <div>
              <label className="label">E-Mail</label>
              <input type="email" className="input" placeholder="name@example.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="label">Passwort</label>
              <input type="password" className="input" placeholder="••••••••" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            {tab === 'register' && (
              <div>
                <label className="label">Farbe</label>
                <div className="flex gap-2">
                  {['#6366f1', '#ec4899', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444'].map((c) => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                      className={`w-8 h-8 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            )}
            {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Laden…' : tab === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </form>

          {tab === 'login' && (
            <p className="text-xs text-gray-400 text-center mt-4">
              Demo: person1@hestia.local / hestia123
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
