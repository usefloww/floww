import { create } from "zustand";

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number; // in milliseconds, 0 for persistent
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newNotification: Notification = {
      id,
      duration: 5000, // Default 5 seconds
      ...notification,
    };

    set(state => ({
      notifications: [newNotification, ...state.notifications]
    }));

    // Auto-remove notification after duration (if not persistent)
    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        get().removeNotification(id);
      }, newNotification.duration);
    }
  },

  removeNotification: (id) => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id)
    }));
  },

  clearAll: () => {
    set({ notifications: [] });
  },
}));

// Helper functions for common notification types
export const showSuccessNotification = (title: string, message?: string) => {
  useNotificationStore.getState().addNotification({
    type: 'success',
    title,
    message,
  });
};

export const showErrorNotification = (title: string, message?: string) => {
  useNotificationStore.getState().addNotification({
    type: 'error',
    title,
    message,
    duration: 0, // Persistent for errors
  });
};

export const showWarningNotification = (title: string, message?: string) => {
  useNotificationStore.getState().addNotification({
    type: 'warning',
    title,
    message,
  });
};

export const showInfoNotification = (title: string, message?: string) => {
  useNotificationStore.getState().addNotification({
    type: 'info',
    title,
    message,
  });
};