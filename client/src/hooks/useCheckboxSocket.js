import { useCallback, useEffect, useRef, useState } from 'react';
import {
    REALTIME_EVENTS,
    buildSessionRealtimeTopic,
    normalizeGroupNumber,
    normalizeSessionCode,
    subscribeToRealtimeTopics
} from '../lib/realtimeClient.js';
import { normalizeChecklistStatus } from '../lib/statusTone.js';

function normalizeCheckboxes(checkboxes = []) {
    return (checkboxes || []).map((checkbox, index) => {
        const status = normalizeChecklistStatus(checkbox?.status);
        return {
            ...checkbox,
            id: Number(checkbox?.id ?? index),
            status,
            completed: checkbox?.completed === true || status === 'green',
            quote: checkbox?.quote ?? null
        };
    });
}

export function useCheckboxSocket() {
    const unsubscribeRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [sessionCode, setSessionCode] = useState(null);
    const [groups, setGroups] = useState(new Map());
    const [sessionEnded, setSessionEnded] = useState(false);

    const applyCheckboxUpdate = useCallback((data) => {
        setGroups(prev => {
            const newGroups = new Map(prev);
            const groupNum = data.group;
            const existing = newGroups.get(groupNum) || {
                transcripts: [],
                checkboxes: [],
                stats: {},
                isReleased: false
            };

            let newTranscripts = [...existing.transcripts];
            if (data.latestTranscript) {
                const isDuplicate = newTranscripts.some(t =>
                    t.text === data.latestTranscript &&
                    Math.abs(t.timestamp - Date.now()) < 5000
                );

                if (!isDuplicate) {
                    newTranscripts.push({
                        text: data.latestTranscript,
                        timestamp: Date.now(),
                        duration: data.transcriptDuration || 0,
                        wordCount: data.transcriptWordCount || 0
                    });
                }
            }

            let newCheckboxes = [...(existing.checkboxes || [])];
            if (Array.isArray(data.checkboxes) && data.checkboxes.length > 0) {
                newCheckboxes = normalizeCheckboxes(data.checkboxes);
            }
            if (data.checkboxUpdates) {
                data.checkboxUpdates.forEach(update => {
                    const index = newCheckboxes.findIndex(c => c.id === update.criteriaId);
                    if (index !== -1) {
                        const checkbox = newCheckboxes[index];
                        const status = normalizeChecklistStatus(update.status);
                        if (!checkbox.completed || checkbox.status !== 'green') {
                            newCheckboxes[index] = {
                                ...checkbox,
                                completed: update.completed === true || status === 'green',
                                quote: update.quote,
                                status
                            };
                        }
                    }
                });
            }

            if (data.existingTranscripts) {
                newTranscripts = data.existingTranscripts;
            }

            newGroups.set(groupNum, {
                ...existing,
                transcripts: newTranscripts,
                checkboxes: newCheckboxes,
                stats: data.stats || existing.stats,
                isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
                isReleased: data.isReleased !== undefined ? data.isReleased : existing.isReleased,
                lastUpdate: Date.now()
            });

            return newGroups;
        });
    }, []);

    const applyChecklistState = useCallback((data) => {
        setGroups(prev => {
            const groupNum = normalizeGroupNumber(data.groupNumber);
            if (!groupNum) return prev;
            const newGroups = new Map(prev);
            const existing = newGroups.get(groupNum) || {
                transcripts: [],
                checkboxes: [],
                stats: {},
                isReleased: false
            };

            newGroups.set(groupNum, {
                ...existing,
                checkboxes: Array.isArray(data.criteria) ? normalizeCheckboxes(data.criteria) : existing.checkboxes,
                isReleased: data.isReleased !== undefined ? Boolean(data.isReleased) : existing.isReleased,
                lastUpdate: Date.now()
            });

            return newGroups;
        });
    }, []);

    const handleRealtimeEvent = useCallback((message) => {
        const data = message.payload || {};
        switch (message.type) {
            case REALTIME_EVENTS.CHECKBOX_UPDATE:
            case REALTIME_EVENTS.ADMIN_UPDATE:
                applyCheckboxUpdate(data);
                break;
            case REALTIME_EVENTS.CHECKLIST_STATE:
                applyChecklistState(data);
                break;
            case REALTIME_EVENTS.STUDENT_JOINED:
                setGroups(prev => {
                    const group = normalizeGroupNumber(data.group ?? data.groupNumber);
                    if (!group) return prev;
                    const newGroups = new Map(prev);
                    const existing = newGroups.get(group) || { transcripts: [], checkboxes: [], stats: {}, isReleased: false };
                    newGroups.set(group, { ...existing, isActive: true });
                    return newGroups;
                });
                break;
            case REALTIME_EVENTS.STUDENT_LEFT:
                setGroups(prev => {
                    const group = normalizeGroupNumber(data.group ?? data.groupNumber);
                    const existing = group ? prev.get(group) : null;
                    if (!existing) return prev;
                    const next = new Map(prev);
                    next.set(group, { ...existing, isActive: false });
                    return next;
                });
                break;
            case REALTIME_EVENTS.SESSION_ENDED:
                unsubscribeRef.current?.();
                unsubscribeRef.current = null;
                setSessionEnded(true);
                setIsConnected(false);
                break;
            default:
                break;
        }
    }, [applyCheckboxUpdate, applyChecklistState]);

    const joinSession = useCallback((code, serverTopic, accessToken) => {
        const normalizedCode = normalizeSessionCode(code);
        if (!normalizedCode) return;

        unsubscribeRef.current?.();
        setSessionCode(normalizedCode);
        setSessionEnded(false);
        setIsConnected(false);
        unsubscribeRef.current = subscribeToRealtimeTopics({
            topics: [buildSessionRealtimeTopic(serverTopic)],
            accessToken,
            onEvent: handleRealtimeEvent,
            onStatus: ({ status, error }) => {
                if (status === 'SUBSCRIBED') {
                    setIsConnected(true);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    setIsConnected(false);
                    if (error?.message) {
                        console.warn('Checkbox realtime subscription error:', error.message);
                    }
                }
            }
        });
    }, [handleRealtimeEvent]);

    useEffect(() => {
        return () => {
            unsubscribeRef.current?.();
            unsubscribeRef.current = null;
        };
    }, []);

    return {
        isConnected,
        sessionCode,
        groups,
        sessionEnded,
        setGroups,
        joinSession
    };
}
