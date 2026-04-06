import { useState, useCallback } from 'react';

export function useCriteriaManager(sessionCode, socket) {
    const [scenario, setScenario] = useState('');
    const [criteriaText, setCriteriaText] = useState('');
    const [currentCriteria, setCurrentCriteria] = useState([]);
    const [strictness, setStrictness] = useState(2);
    const [isLoading, setIsLoading] = useState(false);
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

    const saveCriteria = useCallback(async (interval) => {
        if (!criteriaText.trim()) {
            showFeedback('Please enter at least one criterion', 'error');
            return null;
        }

        try {
            setIsLoading(true);
            const parsedCriteria = parseCriteria(criteriaText);
            setCurrentCriteria(parsedCriteria);

            // Cleanup old data
            await fetch(`/api/cleanup/${sessionCode}`, { method: 'POST' });

            const response = await fetch('/api/checkbox/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionCode,
                    criteria: parsedCriteria,
                    scenario: scenario || "Academic discussion session",
                    interval: interval * 1000,
                    strictness
                })
            });

            if (response.ok) {
                showFeedback(`Criteria saved successfully! ${parsedCriteria.length} items ready.`, 'success');
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
            // Assuming we reuse the prompt library endpoint but filter/use differently?
            // Or maybe there's a specific checkbox prompt library endpoint?
            // The original code used `/api/prompt-library` but filtered or used `loadCheckboxPrompt`.
            // Let's assume `/api/prompt-library` returns all prompts and we filter by type/mode if needed, 
            // or just display them. The original code filtered by checking if content had "Scenario:" etc.
            const res = await fetch('/api/prompt-library');
            if (res.ok) {
                const data = await res.json();
                setPromptLibrary(data);
            }
        } catch (err) {
            console.error('Failed to load library:', err);
        }
    }, []);

    const loadPrompt = useCallback((prompt) => {
        const lines = prompt.content.split('\n').filter(line => line.trim());
        let newScenario = '';
        let newCriteriaLines = [];

        if (lines.length > 0 && /^\s*scenario\s*:/i.test(lines[0])) {
            newScenario = lines[0].replace(/^\s*scenario\s*:\s*/i, '').trim();
            newCriteriaLines = lines.slice(1);
        } else {
            if (prompt.scenario) {
                newScenario = prompt.scenario.trim();
                newCriteriaLines = lines;
            } else {
                newCriteriaLines = lines;
            }
        }

        setScenario(newScenario);
        setCriteriaText(newCriteriaLines.join('\n'));
        showFeedback('Prompt loaded', 'success');
    }, []);

    return {
        scenario,
        setScenario,
        criteriaText,
        setCriteriaText,
        currentCriteria,
        strictness,
        setStrictness,
        isLoading,
        feedback,
        promptLibrary,
        saveCriteria,
        loadLibrary,
        loadPrompt,
        setFeedback
    };
}
