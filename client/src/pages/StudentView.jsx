import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { createIcons, icons } from 'lucide';
import { studentBodyMarkup } from '../templates/studentBody.js';
import studentScriptSource from '../scripts/student_inline_original.js?raw';

function StudentView() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    container.innerHTML = studentBodyMarkup;

    if (typeof window !== 'undefined') {
      window.io = window.io || io;
      window.lucide = window.lucide || { createIcons, icons };
    }

    const enhancedScript = `${studentScriptSource}\nif (typeof window !== 'undefined') { window.__studentCleanup = () => { try { socket?.disconnect?.(); } catch (err) { console.warn('Student socket cleanup failed', err); } }; }\nif (typeof document !== 'undefined') { setTimeout(() => document.dispatchEvent(new Event('DOMContentLoaded')), 0); }`;

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.text = enhancedScript;
    document.body.appendChild(script);

    const cleanup = () => {
      if (typeof window !== 'undefined') {
        try {
          window.__studentCleanup?.();
        } catch (err) {
          console.warn('Student cleanup failed', err);
        }
        window.__studentCleanup = undefined;
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

  return <div ref={containerRef} className="student-page-wrapper" />;
}

export default StudentView;
