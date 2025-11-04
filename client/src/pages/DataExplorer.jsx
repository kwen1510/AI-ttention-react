import { useEffect, useRef } from 'react';
import { createIcons, icons } from 'lucide';
import { dataBodyMarkup } from '../templates/dataBody.js';
import dataScriptSource from '../scripts/data_inline_original.js?raw';

function DataExplorer() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    container.innerHTML = dataBodyMarkup;

    if (typeof window !== 'undefined') {
      window.lucide = window.lucide || { createIcons, icons };
    }

    const enhancedScript = `${dataScriptSource}\nif (typeof document !== 'undefined') { setTimeout(() => document.dispatchEvent(new Event('DOMContentLoaded')), 0); }`;

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

  return <div ref={containerRef} className="data-explorer-wrapper" />;
}

export default DataExplorer;
