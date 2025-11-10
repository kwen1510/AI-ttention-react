import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { createIcons, icons } from 'lucide';
import { checkboxBodyMarkup } from '../templates/checkboxBody.js';
import checkboxScriptSource from '../scripts/checkbox_inline_original.js?raw';

function CheckboxDashboard() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    container.innerHTML = checkboxBodyMarkup;

    if (typeof window !== 'undefined') {
      window.io = window.io || io;
      // Wrap createIcons to automatically pass icons parameter
      window.lucide = window.lucide || {
        createIcons: (options) => createIcons({ icons, ...options }),
        icons
      };
      // QRCode is loaded from CDN (see index.html)
    }

    const enhancedScript = `${checkboxScriptSource}\nif (typeof window !== 'undefined') {\n  window.__checkboxCleanup = () => {\n    try { socket?.disconnect?.(); } catch (err) { console.warn('Socket cleanup failed', err); }\n    try { clearInterval(heartbeatInterval); } catch (err) { console.warn(err); }\n    try { clearInterval(connectionCheckInterval); } catch (err) { console.warn(err); }\n    try { clearInterval(elapsedInterval); } catch (err) { console.warn(err); }\n  };\n}\nif (typeof window !== 'undefined' && typeof window.loadPromptLibrary === 'function') { window.loadPromptLibrary(); }`;

    let script = null;
    let timeoutId = null;

    // Delay script execution to ensure AuthContext has set up fetch wrapper with session
    timeoutId = setTimeout(() => {
      script = document.createElement('script');
      script.type = 'text/javascript';
      script.text = enhancedScript;
      document.body.appendChild(script);
      if (typeof document !== 'undefined') {
        setTimeout(() => document.dispatchEvent(new Event('DOMContentLoaded')), 0);
      }
    }, 100); // 100ms delay to let AuthContext fetch wrapper initialize

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (typeof window !== 'undefined') {
        try {
          window.__checkboxCleanup?.();
        } catch (err) {
          console.warn('Checkbox cleanup failed', err);
        }
        window.__checkboxCleanup = undefined;
      }
      if (script?.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };

    return cleanup;
  }, []);

  return <div ref={containerRef} className="checkbox-dashboard-wrapper" />;
}

export default CheckboxDashboard;
