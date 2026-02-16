import { create } from "zustand";
import { persist, createJSONStorage } from 'zustand/middleware'
import { User } from "@/types/api";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  login: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user: User | null) => {
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false
        });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      login: () => {
        console.log('Login called');
        // Redirect to backend auth endpoint with current path
        // Use prompt=select_account to always show account selection
        const currentPath = window.location.pathname + window.location.search;
        const nextParam = encodeURIComponent(currentPath);
        window.location.href = `/auth/login?next=${nextParam}&prompt=select_account`;
      },

      logout: async () => {
        try {
          // Call backend logout endpoint
          await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'include'
          });
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          // Clear local state regardless of API call success
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false
          });
          // Redirect to login page with prompt=select_account to show account selection
          window.location.href = '/auth/login?prompt=select_account';
        }
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      // Only persist user data, not loading states
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated
      }),
    }
  )
);