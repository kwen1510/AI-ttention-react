import { useEffect, useRef } from 'react';
import { createIcons, icons } from 'lucide';
import QRCode from 'qrcodejs2';
import { mindmapBodyMarkup } from '../templates/mindmapBody.js';
import mindmapScriptSource from '../scripts/mindmap_inline_original.js?raw';

function MindmapPage() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    container.innerHTML = mindmapBodyMarkup;

    if (typeof window !== 'undefined') {
      window.lucide = window.lucide || { createIcons, icons };
      window.QRCode = window.QRCode || QRCode;
    }

    const enhancedScript = `${mindmapScriptSource}\nif (typeof document !== 'undefined') { setTimeout(() => document.dispatchEvent(new Event('DOMContentLoaded')), 0); }`;

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.text = enhancedScript;
    document.body.appendChild(script);

    const cleanup = () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };

    return cleanup;
  }, []);

  return <div ref={containerRef} className="mindmap-page-wrapper" />;
}

export default MindmapPage;
