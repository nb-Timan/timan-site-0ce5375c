/**
 * Logs every route change to portal_activity_log (via visitorTracking).
 * No-op until the visitor has opened the popup or logged in (i.e. user_type is set).
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAppUser } from "@/context/AppUserContext";
import {
  logPageView,
  attachSessionEndListener,
  attachModuleActivityListener,
  calculateModuleActiveSeconds,
  getLastModuleInteractionAt,
  getModuleHeartbeatIntervalMs,
  recordPortalModuleUsage,
  shouldCountModuleHeartbeat,
} from "@/lib/visitorTracking";

export default function VisitorTracker() {
  const location = useLocation();
  const { appUser } = useAppUser();

  useEffect(() => {
    attachSessionEndListener();
    attachModuleActivityListener();
  }, []);

  useEffect(() => {
    logPageView(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (!appUser?.email) return;
    let cancelled = false;
    let lastHeartbeatAt = Date.now();
    const path = location.pathname;

    void recordPortalModuleUsage({ user: appUser, path, visitIncrement: 1 });

    const timer = window.setInterval(() => {
      const now = Date.now();
      const visible = document.visibilityState === "visible";
      if (!shouldCountModuleHeartbeat({ visible, nowMs: now, lastInteractionMs: getLastModuleInteractionAt() })) {
        lastHeartbeatAt = now;
        return;
      }

      const activeSeconds = calculateModuleActiveSeconds({ nowMs: now, lastHeartbeatMs: lastHeartbeatAt });
      lastHeartbeatAt = now;
      if (activeSeconds <= 0 || cancelled) return;
      void recordPortalModuleUsage({ user: appUser, path, activeSeconds });
    }, getModuleHeartbeatIntervalMs());

    const handleVisibilityChange = () => {
      lastHeartbeatAt = Date.now();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [appUser, location.pathname]);

  return null;
}
