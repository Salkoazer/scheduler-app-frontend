import React, { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number; // ms
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', duration = 2500, onClose }) => {
  useEffect(() => {
    const id = setTimeout(onClose, duration);
    return () => clearTimeout(id);
  }, [duration, onClose]);

  return (
    <div className={`toast toast-${type}`} role="status" aria-live="polite">
      <span className="toast-message">{message}</span>
      <button className="toast-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </div>
  );
};

export default Toast;
