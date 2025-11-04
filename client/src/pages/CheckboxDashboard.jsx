import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { createIcons, icons } from 'lucide';
import QRCode from 'qrcodejs2';
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
      window.lucide = window.lucide || { createIcons, icons };
      window.QRCode = window.QRCode || QRCode;
    }

    const enhancedScript = `${checkboxScriptSource}\nif (typeof window !== 'undefined') {\n  window.__checkboxCleanup = () => {\n    try { socket?.disconnect?.(); } catch (err) { console.warn('Socket cleanup failed', err); }\n    try { clearInterval(heartbeatInterval); } catch (err) { console.warn(err); }\n    try { clearInterval(connectionCheckInterval); } catch (err) { console.warn(err); }\n    try { clearInterval(elapsedInterval); } catch (err) { console.warn(err); }\n  };\n}\nif (typeof window !== 'undefined' && typeof window.loadPromptLibrary === 'function') { window.loadPromptLibrary(); }`;

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.text = enhancedScript;
    document.body.appendChild(script);
    if (typeof document !== 'undefined') {
      setTimeout(() => document.dispatchEvent(new Event('DOMContentLoaded')), 0);
    }

    const cleanup = () => {
      if (typeof window !== 'undefined') {
        try {
          window.__checkboxCleanup?.();
        } catch (err) {
          console.warn('Checkbox cleanup failed', err);
        }
        window.__checkboxCleanup = undefined;
      }
      if (script.parentNode) {
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
