import { create } from 'zustand';
import { User } from '../api/types';

interface AuthStore {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: localStorage.getItem('hestia-token'),
  setAuth: (user, token) => {
    localStorage.setItem('hestia-token', token);
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem('hestia-token');
    set({ user: null, token: null });
  },
}));
