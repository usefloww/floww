import { useEffect } from 'react';
import { useNotificationStore, Notification } from '@/stores/notificationStore';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export function NotificationContainer() {
  const { notifications, removeNotification } = useNotificationStore();

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map(notification => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}

interface NotificationToastProps {
  notification: Notification;
  onClose: () => void;
}

function NotificationToast({ notification, onClose }: NotificationToastProps) {
  useEffect(() => {
    // Auto-close on Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500 dark:text-red-400" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-500 dark:text-blue-400" />;
    }
  };

  const getBorderColor = () => {
    switch (notification.type) {
      case 'success':
        return 'border-green-200 dark:border-green-800/50';
      case 'error':
        return 'border-red-200 dark:border-red-800/50';
      case 'warning':
        return 'border-yellow-200 dark:border-yellow-800/50';
      case 'info':
        return 'border-blue-200 dark:border-blue-800/50';
    }
  };

  const getBackgroundColor = () => {
    switch (notification.type) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/30';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/30';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/30';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/30';
    }
  };

  return (
    <div className={`max-w-sm w-full bg-card border ${getBorderColor()} rounded-lg shadow-lg p-4 ${getBackgroundColor()}`}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground">
            {notification.title}
          </h4>
          {notification.message && (
            <p className="mt-1 text-sm text-muted-foreground">
              {notification.message}
            </p>
          )}
          {notification.action && (
            <button
              onClick={notification.action.onClick}
              className="mt-2 text-sm text-primary hover:text-primary font-medium"
            >
              {notification.action.label}
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="flex-shrink-0 text-muted-foreground hover:text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}