import { useState, useCallback } from 'react';
import { DEFAULT_SUMMARY_PROMPT, normalizePromptText } from '../lib/prompts.js';

export function usePromptManager(sessionCode, socket) {
    const [currentPrompt, setCurrentPrompt] = useState(DEFAULT_SUMMARY_PROMPT);
    const [promptLibrary, setPromptLibrary] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
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

    const savePrompt = useCallback(async (text) => {
        if (!text.trim()) {
            showFeedback('Please enter a prompt', 'error');
            return;
        }
        try {
            setIsLoading(true);
            // Emit via socket for immediate update
            socket?.emit('prompt_update', { sessionCode, prompt: text });

            const res = await fetch(`/api/session/${sessionCode}/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: text })
            });

            if (res.ok) {
                showFeedback('Prompt saved successfully', 'success');
                setCurrentPrompt(text);
            } else {
                throw new Error('Failed to save');
            }
        } catch (err) {
            showFeedback('Error saving prompt', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [sessionCode, socket]);

    const testPrompt = useCallback(async (text) => {
        if (!text.trim()) return;
        try {
            setIsLoading(true);
            showFeedback('Testing prompt...', 'info');

            const sampleText = "Student A: I think renewable energy is really important for our future. Student B: Yeah, but what about the costs? Solar panels are expensive. Student C: True, but they save money in the long run. Teacher: Great points! What about government incentives? Student A: Oh right, there are tax credits that help reduce the initial cost. Student B: That makes it more affordable then. Student C: Plus think about the environmental benefits - reduced carbon emissions, cleaner air. Teacher: Excellent discussion on the economic and environmental aspects of renewable energy.";

            const res = await fetch('/api/test-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: sampleText, customPrompt: text })
            });

            const data = await res.json();
            if (res.ok) {
                showFeedback(`Test successful! Output: "${data.summary}"`, 'success');
            } else {
                showFeedback(`Test failed: ${data.error}`, 'error');
            }
        } catch (err) {
            showFeedback('Error testing prompt', 'error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadLibrary = useCallback(async () => {
        try {
            const res = await fetch('/api/prompt-library');
            if (res.ok) {
                const data = await res.json();
                setPromptLibrary(data);
            }
        } catch (err) {
            console.error('Failed to load library:', err);
        }
    }, []);

    return {
        currentPrompt,
        setCurrentPrompt,
        promptLibrary,
        isLoading,
        feedback,
        loadSessionPrompt,
        savePrompt,
        testPrompt,
        loadLibrary,
        setFeedback
    };
}
