import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    REALTIME_EVENTS,
    getRealtimeIdentitySession,
    normalizeGroupNumber,
    normalizeSessionCode,
    subscribeToRealtimeTopics
} from '../lib/realtimeClient.js';

export function useStudentSocket() {
    const unsubscribeRef = useRef(null);
    const joinTokenRef = useRef(null);
    const accessTokenRef = useRef(null);
    const sessionRef = useRef({ code: null, group: null });
    const [isConnected, setIsConnected] = useState(false);
    const [sessionInfo, setSessionInfo] = useState({ code: null, group: null, mode: 'summary' });
    const [transcription, setTranscription] = useState(null);
    const [summary, setSummary] = useState(null);
    const [summaryReleased, setSummaryReleased] = useState(false);
    const [checklist, setChecklist] = useState([]);
    const [checklistReleased, setChecklistReleased] = useState(false);
    const [error, setError] = useState(null);
    const [recordingState, setRecordingState] = useState({ isRecording: false, interval: null });

    useEffect(() => {
        sessionRef.current = {
            code: sessionInfo.code,
            group: sessionInfo.group
        };
    }, [sessionInfo.code, sessionInfo.group]);

    const resetState = useCallback(() => {
        setSessionInfo({ code: null, group: null, mode: 'summary' });
        setTranscription(null);
        setSummary(null);
        setSummaryReleased(false);
        setChecklist([]);
        setChecklistReleased(false);
        setError(null);
        setRecordingState({ isRecording: false, interval: null });
        setIsConnected(false);
    }, []);

    const handleRealtimeEvent = useCallback((message) => {
        const payload = message.payload || {};
        const eventGroup = normalizeGroupNumber(payload.groupNumber ?? payload.group ?? message.groupNumber);
        const currentGroup = normalizeGroupNumber(sessionRef.current.group);

        if (eventGroup && currentGroup && eventGroup !== currentGroup) {
            return;
        }

        switch (message.type) {
            case REALTIME_EVENTS.RECORD_NOW:
                setRecordingState({
                    isRecording: true,
                    interval: payload.interval || payload
                });
                break;
            case REALTIME_EVENTS.STOP_RECORDING:
                setRecordingState({ isRecording: false, interval: null });
                break;
            case REALTIME_EVENTS.SESSION_ENDED:
                unsubscribeRef.current?.();
                unsubscribeRef.current = null;
                resetState();
                setError(payload.reason === 'expired'
                    ? 'This session expired. Ask your teacher to create a new session.'
                    : 'The teacher ended this session.');
                break;
            case REALTIME_EVENTS.TRANSCRIPTION_AND_SUMMARY:
                if (payload.transcription) {
                    setTranscription(payload.transcription);
                }
                if (Object.prototype.hasOwnProperty.call(payload, 'isReleased')) {
                    setSummaryReleased(Boolean(payload.isReleased));
                }
                if (Object.prototype.hasOwnProperty.call(payload, 'summary')) {
                    setSummary(payload.summary);
                }
                break;
            case REALTIME_EVENTS.SUMMARY_STATE:
                setSummaryReleased(Boolean(payload.isReleased));
                if (Object.prototype.hasOwnProperty.call(payload, 'summary')) {
                    setSummary(payload.summary);
                }
                break;
            case REALTIME_EVENTS.CHECKBOX_UPDATE:
                if (Array.isArray(payload.checkboxes)) {
                    setChecklist(payload.checkboxes);
                }
                break;
            case REALTIME_EVENTS.CHECKLIST_STATE:
                setChecklist(Array.isArray(payload.criteria) ? payload.criteria : []);
                setChecklistReleased(Boolean(payload.isReleased));
                break;
            default:
                break;
        }
    }, [resetState]);

    const subscribeForSession = useCallback((joinPayload, accessToken) => {
        unsubscribeRef.current?.();
        setIsConnected(false);

        unsubscribeRef.current = subscribeToRealtimeTopics({
            topics: [
                joinPayload.realtime?.studentTopic,
                joinPayload.realtime?.groupTopic
            ],
            accessToken,
            onEvent: handleRealtimeEvent,
            onStatus: ({ status, error: statusError }) => {
                if (status === 'SUBSCRIBED') {
                    setIsConnected(true);
                    setError(null);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    setIsConnected(false);
                    if (statusError?.message) {
                        setError(statusError.message);
                    }
                }
            }
        });
    }, [handleRealtimeEvent]);

    const postStudentEvent = useCallback(async (event, payload = {}) => {
        const { code, group } = sessionRef.current;
        const normalizedCode = normalizeSessionCode(code);
        const parsedGroup = normalizeGroupNumber(group);
        if (!normalizedCode || !parsedGroup) {
            return;
        }

        try {
          const response = await fetch(`/api/session/${normalizedCode}/student-event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessTokenRef.current || ''}`
            },
            body: JSON.stringify({
                event,
                group: parsedGroup,
                token: joinTokenRef.current || undefined,
                payload
            })
          });
          if (response.status === 404 || response.status === 410) {
            resetState();
            setError(response.status === 410
              ? 'This session expired. Ask your teacher to create a new session.'
              : 'This session has ended.');
          }
        } catch (err) {
          console.warn('Failed to publish student event:', err);
        }
    }, [resetState]);

    useEffect(() => {
        return () => {
            const { code, group } = sessionRef.current;
            unsubscribeRef.current?.();
            unsubscribeRef.current = null;
            if (code && group) {
                void fetch(`/api/session/${code}/student-leave`, {
                    method: 'POST',
                    keepalive: true,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessTokenRef.current || ''}`
                    },
                    body: JSON.stringify({
                        group,
                        token: joinTokenRef.current || undefined
                    })
                }).catch(() => {});
            }
        };
    }, []);

    useEffect(() => {
        if (!sessionInfo.code || !sessionInfo.group) return undefined;

        const interval = setInterval(() => {
            postStudentEvent('heartbeat', {});
        }, 10000);

        return () => clearInterval(interval);
    }, [postStudentEvent, sessionInfo.code, sessionInfo.group]);

    const joinSession = useCallback(async (code, group, token = null, captchaToken = null) => {
        const normalizedCode = normalizeSessionCode(code);
        const parsedGroup = normalizeGroupNumber(group);
        if (!normalizedCode || !parsedGroup) {
            return;
        }

        try {
            setError(null);
            joinTokenRef.current = token || null;
            const realtimeSession = await getRealtimeIdentitySession(captchaToken);
            accessTokenRef.current = realtimeSession.access_token;
            const response = await fetch(`/api/session/${normalizedCode}/student-join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${realtimeSession.access_token}`
                },
                body: JSON.stringify({
                    group: parsedGroup,
                    token: token || undefined
                })
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.error || `Failed to join session (${response.status})`);
            }

            setSessionInfo({
                code: data.code,
                group: data.group,
                mode: data.mode || 'summary',
                expiresAt: data.expiresAt || null
            });
            if (data.status === 'recording' && data.interval) {
                setRecordingState({ isRecording: true, interval: data.interval });
            } else {
                setRecordingState({ isRecording: false, interval: null });
            }

            if (data.summaryState) {
                setSummaryReleased(Boolean(data.summaryState.isReleased));
                setSummary(data.summaryState.summary ?? null);
            }
            if (data.checklistState) {
                setChecklist(Array.isArray(data.checklistState.criteria) ? data.checklistState.criteria : []);
                setChecklistReleased(Boolean(data.checklistState.isReleased));
            }

            subscribeForSession(data, realtimeSession.access_token);
        } catch (err) {
            console.error('Student realtime join error:', err);
            setError(err.message || 'Unable to join');
            setIsConnected(false);
        }
    }, [subscribeForSession]);

    const leaveSession = useCallback(() => {
        const { code, group } = sessionRef.current;
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        if (code && group) {
            void fetch(`/api/session/${code}/student-leave`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessTokenRef.current || ''}`
                },
                body: JSON.stringify({
                    group,
                    token: joinTokenRef.current || undefined
                })
            }).catch(() => {});
        }
        joinTokenRef.current = null;
        accessTokenRef.current = null;
        resetState();
    }, [resetState]);

    const realtimeTransport = useMemo(() => ({
        get connected() {
            return isConnected;
        },
        get accessToken() {
            return accessTokenRef.current;
        },
        emit(event, payload) {
            postStudentEvent(event, payload);
        }
    }), [isConnected, postStudentEvent]);

    return {
        socket: realtimeTransport,
        isConnected,
        sessionInfo,
        transcription,
        summary,
        summaryReleased,
        checklist,
        setChecklist,
        checklistReleased,
        setChecklistReleased,
        error,
        recordingState,
        joinSession,
        leaveSession
    };
}
