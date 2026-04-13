import React, { createContext, useContext, useState, useCallback } from "react";
import ChawpNotification from "../components/ChawpNotification";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notification, setNotification] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
    actions: [],
    duration: 4000,
  });

  const showNotification = useCallback(
    ({ type, title, message, actions, duration }) => {
      setNotification({
        visible: true,
        type: type || "info",
        title: title || "",
        message: message || "",
        actions: actions || [],
        duration: duration !== undefined ? duration : 4000,
      });
    },
    []
  );

  const hideNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, visible: false }));
  }, []);

  // Convenience methods
  const success = useCallback(
    (title, message, actions, duration) => {
      showNotification({ type: "success", title, message, actions, duration });
    },
    [showNotification]
  );

  const error = useCallback(
    (title, message, actions, duration) => {
      showNotification({ type: "error", title, message, actions, duration });
    },
    [showNotification]
  );

  const warning = useCallback(
    (title, message, actions, duration) => {
      showNotification({ type: "warning", title, message, actions, duration });
    },
    [showNotification]
  );

  const info = useCallback(
    (title, message, actions, duration) => {
      showNotification({ type: "info", title, message, actions, duration });
    },
    [showNotification]
  );

  // Alert-like function for easy migration from Alert.alert
  const alert = useCallback(
    (title, message, buttons, options = {}) => {
      const actions =
        buttons?.map((button) => ({
          text: button.text,
          onPress: button.onPress,
          style:
            button.style === "cancel"
              ? "default"
              : button.style === "destructive"
              ? "destructive"
              : "primary",
        })) || [];

      const type = options.type || "info";
      const duration = buttons && buttons.length > 0 ? 0 : 4000; // Don't auto-dismiss if has actions

      showNotification({ type, title, message, actions, duration });
    },
    [showNotification]
  );

  const value = {
    showNotification,
    hideNotification,
    success,
    error,
    warning,
    info,
    alert,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ChawpNotification
        visible={notification.visible}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        actions={notification.actions}
        duration={notification.duration}
        onClose={hideNotification}
      />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotification must be used within a NotificationProvider"
    );
  }
  return context;
}
