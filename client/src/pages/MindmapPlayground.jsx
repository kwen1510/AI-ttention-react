import { useEffect, useRef } from 'react';
import { mindmapPlaygroundBodyMarkup } from '../templates/mindmapPlaygroundBody.js';
import mindmapPlaygroundScriptSource from '../scripts/mindmap_playground_inline_original.js?raw';

function MindmapPlayground() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    container.innerHTML = mindmapPlaygroundBodyMarkup;

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.text = mindmapPlaygroundScriptSource;
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

  return <div ref={containerRef} className="mindmap-playground-wrapper" />;
}

export default MindmapPlayground;
