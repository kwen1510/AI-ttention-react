import { useState, useCallback } from 'react';
import { parseCheckboxPromptContent } from '../lib/prompts.js';

export function useCriteriaManager(sessionCode, socket) {
    const [scenario, setScenario] = useState('');
    const [criteriaText, setCriteriaText] = useState('');
    const [currentCriteria, setCurrentCriteria] = useState([]);
    const [strictness, setStrictness] = useState(2);
    const [isLoading, setIsLoading] = useState(false);
    const [isLibraryLoading, setIsLibraryLoading] = useState(false);
    const [libraryError, setLibraryError] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [promptLibrary, setPromptLibrary] = useState([]);

    const showFeedback = (message, type = 'info') => {
        setFeedback({ message, type });
        if (type !== 'error') {
            setTimeout(() => setFeedback(null), 5000);
        }
    };

    const parseCriteria = (text) => {
        return text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map((line, index) => {
                const match = line.match(/^(.+?)\s*\((.+)\)\s*$/);
                if (match) {
                    return {
                        id: index,
                        description: match[1].trim(),
                        rubric: match[2].trim(),
                        completed: false,
                        quote: null,
                        status: 'grey'
                    };
                } else {
                    return {
                        id: index,
                        description: line,
                        rubric: "No specific rubric provided",
                        completed: false,
                        quote: null,
                        status: 'grey'
                    };
                }
            });
    };

    const formatCriteriaText = useCallback((criteria = []) => {
        return (criteria || [])
            .map((criterion) => {
                const description = String(criterion?.description || '').trim();
                const rubric = String(criterion?.rubric || '').trim();
                if (!description) return null;
                if (!rubric || rubric === 'No specific rubric provided') {
                    return description;
                }
                return `${description} (${rubric})`;
            })
            .filter(Boolean)
            .join('\n');
    }, []);

    const hydrateCriteria = useCallback((criteria = []) => {
        return (criteria || []).map((criterion, index) => ({
            id: Number(criterion?.id ?? index),
            dbId: criterion?.dbId,
            description: String(criterion?.description || ''),
            rubric: String(criterion?.rubric || 'No specific rubric provided'),
            completed: criterion?.completed === true,
            quote: criterion?.quote ?? null,
            status: criterion?.status || 'grey',
            weight: criterion?.weight || 1
        }));
    }, []);

    const saveCriteria = useCallback(async (interval, overrides = {}, options = {}) => {
        const nextCriteriaText = String(overrides.criteriaText ?? criteriaText);
        const nextScenario = String(overrides.scenario ?? scenario);
        const nextStrictness = Number(overrides.strictness ?? strictness);

        if (!nextCriteriaText.trim()) {
            showFeedback('Please enter at least one criterion', 'error');
            return null;
        }

        try {
            setIsLoading(true);
            const parsedCriteria = parseCriteria(nextCriteriaText);
            setCurrentCriteria(parsedCriteria);
            setScenario(nextScenario);
            setCriteriaText(nextCriteriaText);
            setStrictness(nextStrictness);

            // Cleanup old data
            await fetch(`/api/cleanup/${sessionCode}`, { method: 'POST' });

            const response = await fetch('/api/checkbox/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionCode,
                    criteria: parsedCriteria,
                    scenario: nextScenario || "Academic discussion session",
                    interval: interval * 1000,
                    strictness: nextStrictness
                })
            });

            if (response.ok) {
                showFeedback(
                    options.successMessage || `Criteria saved successfully! ${parsedCriteria.length} items ready.`,
                    'success'
                );
                return parsedCriteria;
            } else {
                throw new Error('Failed to save criteria');
            }
        } catch (err) {
            console.error(err);
            showFeedback('Error saving criteria', 'error');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [sessionCode, criteriaText, scenario, strictness]);

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

    const loadPrompt = useCallback((prompt) => {
        const parsedPrompt = parseCheckboxPromptContent(prompt.content, prompt.scenario || '');

        setScenario(parsedPrompt.scenario);
        setCriteriaText(parsedPrompt.criteriaText);
        showFeedback('Prompt loaded', 'success');
    }, []);

    const loadSessionCriteria = useCallback(async () => {
        if (!sessionCode) {
            return null;
        }

        try {
            const response = await fetch(`/api/checkbox/${sessionCode}`);
            if (response.status === 404) {
                return null;
            }
            if (!response.ok) {
                throw new Error(`Failed to load checklist session (${response.status})`);
            }

            const data = await response.json();
            if (data?.success === false && (!Array.isArray(data.criteriaWithProgress) || data.criteriaWithProgress.length === 0)) {
                return null;
            }
            const hydratedCriteria = hydrateCriteria(data.criteriaWithProgress || []);
            setScenario(String(data.scenario || ''));
            setCriteriaText(formatCriteriaText(hydratedCriteria));
            setCurrentCriteria(hydratedCriteria);

            return {
                ...data,
                criteria: hydratedCriteria
            };
        } catch (err) {
            console.error('Failed to load checklist session:', err);
            return null;
        }
    }, [formatCriteriaText, hydrateCriteria, sessionCode]);

    const recordPromptUse = useCallback(async (promptId) => {
        if (!promptId) return;
        try {
            await fetch(`/api/prompts/${promptId}/use`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionCode: sessionCode || 'current-session' })
            });
        } catch (err) {
            console.warn('Failed to record prompt usage:', err);
        }
    }, [sessionCode]);

    const applyLibraryPrompt = useCallback(async (prompt, interval) => {
        const parsedPrompt = parseCheckboxPromptContent(prompt?.content, prompt?.scenario || '');
        const nextStrictness = Number(prompt?.strictness || strictness || 2);

        const savedCriteria = await saveCriteria(
            interval,
            {
                scenario: parsedPrompt.scenario,
                criteriaText: parsedPrompt.criteriaText,
                strictness: nextStrictness
            },
            {
                successMessage: `${prompt?.title || 'Prompt'} applied to session`
            }
        );

        if (savedCriteria) {
            await recordPromptUse(prompt?._id);
        }

        return savedCriteria;
    }, [recordPromptUse, saveCriteria, strictness]);

    return {
        scenario,
        setScenario,
        criteriaText,
        setCriteriaText,
        currentCriteria,
        strictness,
        setStrictness,
        isLoading,
        isLibraryLoading,
        libraryError,
        feedback,
        promptLibrary,
        saveCriteria,
        loadLibrary,
        loadSessionCriteria,
        loadPrompt,
        applyLibraryPrompt,
        setFeedback
    };
}
