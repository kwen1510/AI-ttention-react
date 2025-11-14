import { useEffect } from "react";
import { createIcons, icons } from "lucide";
import PromptsDashboardView from "../features/prompts/PromptsDashboardView.jsx";
import promptsScriptSource from "../scripts/prompts_inline_original.js?raw";

function PromptsPage() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.__destroyPromptsDashboard) {
      window.__destroyPromptsDashboard();
    }
    if (typeof window !== "undefined") {
      // Wrap createIcons to automatically pass icons parameter
      window.lucide = window.lucide || {
        createIcons: (options) => createIcons({ icons, ...options }),
        icons,
      };
    }

    // Wrap script in IIFE for variable isolation, functions are exposed to window at the end of the script
    const enhancedScript = `(function(){\n${promptsScriptSource}\n})();\nif (typeof document !== 'undefined') { setTimeout(() => document.dispatchEvent(new Event('DOMContentLoaded')), 0); }`;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.text = enhancedScript;
    document.body.appendChild(script);

    const cleanup = () => {
      if (typeof window !== "undefined" && window.__destroyPromptsDashboard) {
        window.__destroyPromptsDashboard();
      }
      // Clean up global functions - set to undefined instead of delete
      if (typeof window !== "undefined") {
        window.viewPrompt = undefined;
        window.openCreateModal = undefined;
        window.closePromptModal = undefined;
        window.closeViewModal = undefined;
        window.editPrompt = undefined;
        window.clonePrompt = undefined;
        window.deletePrompt = undefined;
        window.usePrompt = undefined;
        window.refreshPrompts = undefined;
        window.previousPage = undefined;
        window.nextPage = undefined;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    return cleanup;
  }, []);

  return (
    <div id="promptsDashboardRoot" className="prompts-page-wrapper">
      <PromptsDashboardView />
    </div>
  );
}

export default PromptsPage;
