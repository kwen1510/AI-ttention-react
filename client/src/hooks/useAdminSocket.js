import { useCallback, useEffect, useRef, useState } from 'react';
import {
    REALTIME_EVENTS,
    buildSessionRealtimeTopic,
    normalizeGroupNumber,
    normalizeSessionCode,
    subscribeToRealtimeTopics
} from '../lib/realtimeClient.js';

export function useAdminSocket() {
    const unsubscribeRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [sessionCode, setSessionCode] = useState(null);
    const [groups, setGroups] = useState(new Map());
    const [sessionEnded, setSessionEnded] = useState(false);

    const applyAdminUpdate = useCallback((data) => {
        setGroups(prev => {
            const newGroups = new Map(prev);
            const groupNum = data.group;
            const existing = newGroups.get(groupNum) || {
                transcripts: [],
                summary: null,
                stats: {},
                uploadErrors: 0,
                uploadStatus: null,
                isActive: true,
                isReleased: false
            };

            let newTranscripts = [...existing.transcripts];
            if (data.latestTranscript) {
                newTranscripts.push({
                    text: data.latestTranscript,
                    timestamp: Date.now(),
                    duration: data.transcriptDuration || 0,
                    wordCount: data.transcriptWordCount || 0
                });
                if (newTranscripts.length > 10) newTranscripts = newTranscripts.slice(-10);
            }

            newGroups.set(groupNum, {
                ...existing,
                transcripts: newTranscripts,
                cumulativeTranscript: data.cumulativeTranscript || existing.cumulativeTranscript,
                summary: data.summary ? { text: data.summary, timestamp: Date.now() } : existing.summary,
                stats: data.stats || existing.stats,
                isReleased: typeof data.summaryReleased === 'boolean' ? data.summaryReleased : existing.isReleased,
                isActive: typeof data.isActive === 'boolean' ? data.isActive : existing.isActive,
                lastUpdate: Date.now()
            });

            return newGroups;
        });
    }, []);

    const applyUploadStatus = useCallback((data) => {
        setGroups(prev => {
            const newGroups = new Map(prev);
            const existing = newGroups.get(data.group) || {
                transcripts: [],
                summary: null,
                stats: {},
                uploadErrors: 0,
                uploadStatus: null,
                isActive: true,
                isReleased: false
            };

            newGroups.set(data.group, {
                ...existing,
                uploadStatus: {
                    phase: data.phase || 'idle',
                    pendingUploads: Number(data.pendingUploads || 0),
                    chunkSize: Number(data.chunkSize || 0),
                    lastUploadedAt: data.lastUploadedAt || existing.uploadStatus?.lastUploadedAt || null,
                    lastError: data.lastError || null,
                    timestamp: data.timestamp || Date.now()
                },
                isActive: true,
                lastUpdate: Date.now()
            });

            return newGroups;
        });
    }, []);

    const handleRealtimeEvent = useCallback((message) => {
        const data = message.payload || {};
        switch (message.type) {
            case REALTIME_EVENTS.ADMIN_UPDATE:
                applyAdminUpdate(data);
                break;
            case REALTIME_EVENTS.UPLOAD_ERROR:
                setGroups(prev => {
                    const newGroups = new Map(prev);
                    const group = newGroups.get(data.group);
                    if (group) {
                        newGroups.set(data.group, {
                            ...group,
                            uploadErrors: (group.uploadErrors || 0) + 1
                        });
                    }
                    return newGroups;
                });
                console.warn('Upload error in group %s:', data.group, data.error);
                break;
            case REALTIME_EVENTS.UPLOAD_STATUS:
                applyUploadStatus(data);
                break;
            case REALTIME_EVENTS.STUDENT_JOINED:
                setGroups(prev => {
                    const newGroups = new Map(prev);
                    const groupNumber = normalizeGroupNumber(data.group ?? data.groupNumber);
                    if (!groupNumber) return prev;
                    const existing = newGroups.get(groupNumber) || {
                        transcripts: [],
                        summary: null,
                        stats: {},
                        uploadErrors: 0,
                        uploadStatus: null,
                        isReleased: false
                    };
                    newGroups.set(groupNumber, {
                        ...existing,
                        isReleased: typeof data.summaryReleased === 'boolean' ? data.summaryReleased : existing.isReleased,
                        isActive: true,
                        lastUpdate: Date.now()
                    });
                    return newGroups;
                });
                break;
            case REALTIME_EVENTS.STUDENT_LEFT:
                setGroups(prev => {
                    const groupNumber = normalizeGroupNumber(data.group ?? data.groupNumber);
                    const existing = groupNumber ? prev.get(groupNumber) : null;
                    if (!existing) return prev;
                    const next = new Map(prev);
                    next.set(groupNumber, {
                        ...existing,
                        isActive: false,
                        lastUpdate: Date.now()
                    });
                    return next;
                });
                break;
            case REALTIME_EVENTS.SUMMARY_STATE:
                setGroups(prev => {
                    const groupNum = normalizeGroupNumber(data.groupNumber);
                    if (!groupNum) return prev;
                    const next = new Map(prev);
                    const existing = next.get(groupNum) || {
                        transcripts: [],
                        summary: null,
                        stats: {},
                        uploadErrors: 0,
                        uploadStatus: null,
                        isActive: true,
                        isReleased: false
                    };
                    next.set(groupNum, {
                        ...existing,
                        summary: data.summary
                            ? { text: data.summary, timestamp: Date.now() }
                            : existing.summary,
                        isReleased: Boolean(data.isReleased),
                        lastUpdate: Date.now()
                    });
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
    }, [applyAdminUpdate, applyUploadStatus]);

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
                        console.warn('Teacher realtime subscription error:', error.message);
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
