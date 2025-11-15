import { useEffect } from "react";
import { io } from "socket.io-client";
import { createIcons, icons } from "lucide";
import CheckboxDashboardView from "../features/checkbox/CheckboxDashboardView.jsx";
import checkboxScriptSource from "../scripts/checkbox_inline_original.js?raw";

function CheckboxDashboard() {
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

    const enhancedScript = `(function(){\n${checkboxScriptSource}\nif (typeof window !== 'undefined') {\n  window.__checkboxCleanup = () => {\n    try { socket?.disconnect?.(); } catch (err) { console.warn('Socket cleanup failed', err); }\n    try { clearInterval(heartbeatInterval); } catch (err) { console.warn(err); }\n    try { clearInterval(connectionCheckInterval); } catch (err) { console.warn(err); }\n    try { clearInterval(elapsedInterval); } catch (err) { console.warn(err); }\n    // Clean up global functions\n    window.openQrModal = undefined;\n    window.closeQrModal = undefined;\n    window.loadCheckboxPrompt = undefined;\n    window.toggleCriteriaEditor = undefined;\n    window.addCriterion = undefined;\n    window.removeCriterion = undefined;\n    window.saveCriteria = undefined;\n    window.toggleFormatHelp = undefined;\n  };\n}\n})();`;

    let script = null;
    let timeoutId = null;

    // Delay script execution to ensure AuthContext has set up fetch wrapper with session
    timeoutId = setTimeout(() => {
      // console.log("💉 CheckboxDashboard injecting script");
      // Clean up any existing dashboard scripts first
      const existingScripts = document.querySelectorAll(
        "script[data-dashboard]",
      );
      // console.log("🗑️ Removing", existingScripts.length, "existing scripts");
      existingScripts.forEach((s) => s.parentNode?.removeChild(s));

      // Run cleanup functions from other dashboards
      if (window.__adminCleanup) {
        // console.log("🧹 Running admin cleanup from checkbox");
        try {
          window.__adminCleanup();
        } catch (err) {
          console.warn(err);
        }
        window.__adminCleanup = undefined;
      }

      script = document.createElement("script");
      script.type = "text/javascript";
      script.setAttribute("data-dashboard", "checkbox");
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
      // console.log("🧹 CheckboxDashboard cleanup called");
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (typeof window !== "undefined") {
        try {
          window.__checkboxCleanup?.();
        } catch (err) {
          console.warn("Checkbox cleanup failed", err);
        }
        window.__checkboxCleanup = undefined;
      }
      if (script?.parentNode) {
        script.parentNode.removeChild(script);
        script = null;
      }
    };

    return cleanup;
  }, []);

  return (
    <div className="checkbox-dashboard-wrapper">
      <CheckboxDashboardView />
    </div>
  );
}

export default CheckboxDashboard;
