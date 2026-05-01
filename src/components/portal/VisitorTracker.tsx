/**
 * Logs every route change to portal_activity_log (via visitorTracking).
 * No-op until the visitor has opened the popup or logged in (i.e. user_type is set).
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { logPageView, attachSessionEndListener } from "@/lib/visitorTracking";

export default function VisitorTracker() {
  const location = useLocation();

  useEffect(() => {
    attachSessionEndListener();
  }, []);

  useEffect(() => {
    logPageView(location.pathname);
  }, [location.pathname]);

  return null;
}
