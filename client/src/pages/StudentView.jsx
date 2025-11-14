import { useEffect } from "react";
import { io } from "socket.io-client";
import { createIcons, icons } from "lucide";
import StudentViewLayout from "../features/student/StudentViewLayout.jsx";
import studentScriptSource from "../scripts/student_inline_original.js?raw";

function StudentView() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.io = window.io || io;
      // Wrap createIcons to automatically pass icons parameter
      window.lucide = window.lucide || {
        createIcons: (options) => createIcons({ icons, ...options }),
        icons,
      };
    }

    const enhancedScript = `(function(){\n${studentScriptSource}\nif (typeof window !== 'undefined') { window.__studentCleanup = () => { try { socket?.disconnect?.(); } catch (err) { console.warn('Student socket cleanup failed', err); } }; }\nif (typeof document !== 'undefined') { setTimeout(() => document.dispatchEvent(new Event('DOMContentLoaded')), 0); }\n})();`;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.text = enhancedScript;
    document.body.appendChild(script);

    const cleanup = () => {
      if (typeof window !== "undefined") {
        try {
          window.__studentCleanup?.();
        } catch (err) {
          console.warn("Student cleanup failed", err);
        }
        window.__studentCleanup = undefined;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    return cleanup;
  }, []);

  return (
    <div className="student-page-wrapper">
      <StudentViewLayout />
    </div>
  );
}

export default StudentView;
