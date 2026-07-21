import { useState, useCallback } from 'react';
import { DEFAULT_SUMMARY_PROMPT, normalizePromptText } from '../lib/prompts.js';

export function usePromptManager(sessionCode) {
    const [currentPrompt, setCurrentPrompt] = useState(DEFAULT_SUMMARY_PROMPT);
    const [promptLibrary, setPromptLibrary] = useState([]);
    const [isLibraryLoading, setIsLibraryLoading] = useState(false);
    const [libraryError, setLibraryError] = useState(null);
    const [feedback, setFeedback] = useState(null);

    const showFeedback = (message, type = 'info') => {
        setFeedback({ message, type });
        if (type !== 'error') {
            setTimeout(() => setFeedback(null), 5000);
        }
    };

    const loadSessionPrompt = useCallback(async ({ signal, fallbackPrompt } = {}) => {
        const resolvedFallback = normalizePromptText(fallbackPrompt) || DEFAULT_SUMMARY_PROMPT;

        if (!sessionCode) {
            setCurrentPrompt(resolvedFallback);
            return;
        }
        try {
            const res = await fetch(`/api/session/${sessionCode}/prompt`, { signal });
            if (!res.ok) {
                setCurrentPrompt(resolvedFallback);
                return;
            }

            const data = await res.json();
            const nextPrompt = normalizePromptText(data?.prompt) || resolvedFallback;
            setCurrentPrompt(nextPrompt);
        } catch (err) {
            if (err?.name === 'AbortError' || signal?.aborted) {
                return;
            }

            setCurrentPrompt(resolvedFallback);
        }
    }, [sessionCode]);

    const savePrompt = useCallback(async (text, options = {}) => {
        if (!text.trim()) {
            showFeedback('Please enter a prompt', 'error');
            return false;
        }
        try {
            const res = await fetch(`/api/session/${sessionCode}/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: text })
            });

            if (res.ok) {
                showFeedback(options.successMessage || 'Prompt saved successfully', 'success');
                setCurrentPrompt(text);
                return true;
            } else {
                throw new Error('Failed to save');
            }
        } catch (err) {
            showFeedback('Error saving prompt', 'error');
            return false;
        }
    }, [sessionCode]);

    const loadLibrary = useCallback(async () => {
        try {
            setIsLibraryLoading(true);
            setLibraryError(null);
            const res = await fetch('/api/prompt-library');
            if (res.ok) {
                const data = await res.json();
                setPromptLibrary(data);
                return data;
            }
            throw new Error(`Failed to load library (${res.status})`);
        } catch (err) {
            console.error('Failed to load library:', err);
            setLibraryError(err.message || 'Failed to load saved prompts');
            return [];
        } finally {
            setIsLibraryLoading(false);
        }
    }, []);

    const applyLibraryPrompt = useCallback(async (prompt) => {
        const text = normalizePromptText(prompt?.content);
        if (!text) {
            showFeedback('Selected prompt is empty', 'error');
            return false;
        }

        const success = await savePrompt(text, {
            successMessage: `${prompt.title || 'Prompt'} applied to session`
        });

        return success;
    }, [savePrompt]);

    return {
        currentPrompt,
        setCurrentPrompt,
        promptLibrary,
        isLibraryLoading,
        libraryError,
        feedback,
        loadSessionPrompt,
        savePrompt,
        loadLibrary,
        applyLibraryPrompt,
        setFeedback
    };
}
