import { useEffect } from "react";
import { io } from "socket.io-client";
import { createIcons, icons } from "lucide";
import AdminDashboardView from "../features/admin/AdminDashboardView.jsx";
import adminScriptSource from "../scripts/admin_inline_original.js?raw";

function AdminDashboard() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.io = window.io || io;
      // Wrap createIcons to automatically pass icons parameter
      window.lucide = window.lucide || {
        createIcons: (options) => createIcons({ icons, ...options }),
        icons,
      };
      // QRCode is loaded from CDN (see index.html)
    }

    // Wrap script in IIFE for variable isolation, functions are exposed to window at the end of the script
    const enhancedScript = `(function(){\n${adminScriptSource}\nif (typeof window !== 'undefined') {\n  window.__adminCleanup = () => {\n    try { socket?.disconnect?.(); } catch (err) { console.warn('Socket cleanup failed', err); }\n    try { clearInterval(heartbeatInterval); } catch (err) { console.warn(err); }\n    try { clearInterval(connectionCheckInterval); } catch (err) { console.warn(err); }\n    try { clearInterval(elapsedInterval); } catch (err) { console.warn(err); }\n    // Clean up global functions to prevent them from running in other views\n    window.loadPromptLibrary = undefined;\n    window.updateCategoryFilter = undefined;\n    window.refreshPromptLibrary = undefined;\n    window.openQrModal = undefined;\n    window.closeQrModal = undefined;\n    window.togglePromptEditor = undefined;\n    window.openCreatePromptModal = undefined;\n    window.closeCreatePromptModal = undefined;\n    window.saveCurrentPrompt = undefined;\n  };\n}\n})();\nif (typeof window !== 'undefined' && typeof window.loadPromptLibrary === 'function') { window.loadPromptLibrary(); }`;

    let script = null;
    let timeoutId = null;

    // Delay script execution to ensure AuthContext has set up fetch wrapper with session
    timeoutId = setTimeout(() => {
      console.log("💉 AdminDashboard injecting script");
      // Clean up any existing dashboard scripts first
      const existingScripts = document.querySelectorAll(
        "script[data-dashboard]",
      );
      console.log("🗑️ Removing", existingScripts.length, "existing scripts");
      existingScripts.forEach((s) => s.parentNode?.removeChild(s));

      // Run cleanup functions from other dashboards
      if (window.__checkboxCleanup) {
        console.log("🧹 Running checkbox cleanup from admin");
        try {
          window.__checkboxCleanup();
        } catch (err) {
          console.warn(err);
        }
        window.__checkboxCleanup = undefined;
      }

      script = document.createElement("script");
      script.type = "text/javascript";
      script.setAttribute("data-dashboard", "admin");
      script.text = enhancedScript;
      document.body.appendChild(script);
      if (typeof document !== "undefined") {
        setTimeout(
          () => document.dispatchEvent(new Event("DOMContentLoaded")),
          0,
        );
      }
    }, 100); // 100ms delay to let AuthContext fetch wrapper initialize

    const cleanup = () => {
      console.log("🧹 AdminDashboard cleanup called");
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (typeof window !== "undefined") {
        try {
          window.__adminCleanup?.();
        } catch (err) {
          console.warn("Admin cleanup failed", err);
        }
        window.__adminCleanup = undefined;
      }
      if (script?.parentNode) {
        script.parentNode.removeChild(script);
        script = null;
      }
    };

    return cleanup;
  }, []);

  return (
    <div className="admin-dashboard-wrapper">
      <AdminDashboardView />
    </div>
  );
}

export default AdminDashboard;
