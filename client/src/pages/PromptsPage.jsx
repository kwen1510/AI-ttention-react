import { useEffect, useRef } from 'react';
import { createIcons, icons } from 'lucide';
import { promptsBodyMarkup } from '../templates/promptsBody.js';
import promptsScriptSource from '../scripts/prompts_inline_original.js?raw';

function PromptsPage() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    container.innerHTML = promptsBodyMarkup;

    if (typeof window !== 'undefined') {
      // Wrap createIcons to automatically pass icons parameter
      window.lucide = window.lucide || {
        createIcons: (options) => createIcons({ icons, ...options }),
        icons
      };
    }

    const enhancedScript = `${promptsScriptSource}\nif (typeof document !== 'undefined') { setTimeout(() => document.dispatchEvent(new Event('DOMContentLoaded')), 0); }`;

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

  return <div ref={containerRef} className="prompts-page-wrapper" />;
}

export default PromptsPage;
