import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useStudentSocket(joinToken = '') {
    const socketRef = useRef(null);
    const joinTokenRef = useRef(String(joinToken || '').trim());
    const joinStateRef = useRef({ code: null, group: null });
    const [isConnected, setIsConnected] = useState(false);
    const [sessionInfo, setSessionInfo] = useState({ code: null, group: null, mode: 'summary' });
    const [transcription, setTranscription] = useState(null);
    const [summary, setSummary] = useState(null);
    const [checklist, setChecklist] = useState([]);
    const [checklistReleased, setChecklistReleased] = useState(false);
    const [error, setError] = useState(null);
    const [recordingState, setRecordingState] = useState({ isRecording: false, interval: null });

    useEffect(() => {
        joinStateRef.current = {
            code: sessionInfo.code,
            group: sessionInfo.group
        };
    }, [sessionInfo.code, sessionInfo.group]);

    useEffect(() => {
        joinTokenRef.current = String(joinToken || '').trim();
    }, [joinToken]);

    // Initialize socket
    useEffect(() => {
        const token = String(joinToken || '').trim();
        const socket = token
            ? io({
                auth: {
                    type: 'student',
                    joinToken: token
                }
            })
            : io();
        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            setError(null);
            const { code, group } = joinStateRef.current;
            if (code && group) {
                socket.emit('join', { code, group });
            } else if (joinTokenRef.current && group) {
                socket.emit('join', { group });
            }
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
        });

        socket.on('error', (msg) => {
            console.error('Socket error:', msg);
            setError(msg);
        });

        socket.on('connect_error', (err) => {
            setIsConnected(false);
            setError(err.message || 'Unable to connect');
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [joinToken]);

    // Event handlers
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;

        const handleJoined = (data) => {
            setSessionInfo({
                code: data.code,
                group: data.group,
                mode: data.mode || 'summary'
            });
            setError(null);

            if (data.status === 'recording' && data.interval) {
                setRecordingState({ isRecording: true, interval: data.interval });
            }
        };

        const handleRecordNow = (interval) => {
            setRecordingState({ isRecording: true, interval });
        };

        const handleStopRecording = () => {
            setRecordingState({ isRecording: false, interval: null });
        };

        const handleTranscriptionAndSummary = (data) => {
            if (data.transcription) {
                setTranscription(data.transcription);
            }
            if (data.summary) {
                setSummary(data.summary);
            }
        };

        const handleCheckboxUpdate = (data) => {
            if (Number(data.group) !== Number(sessionInfo.group)) {
                return;
            }

            if (Array.isArray(data.checkboxes)) {
                setChecklist(data.checkboxes);
            }
        };

        const handleChecklistState = (data) => {
            if (Number(data.groupNumber) !== Number(sessionInfo.group)) {
                return;
            }

            setChecklist(Array.isArray(data.criteria) ? data.criteria : []);
            setChecklistReleased(Boolean(data.isReleased));
        };

        socket.on('joined', handleJoined);
        socket.on('record_now', handleRecordNow);
        socket.on('stop_recording', handleStopRecording);
        socket.on('transcription_and_summary', handleTranscriptionAndSummary);
        socket.on('checkbox_update', handleCheckboxUpdate);
        socket.on('checklist_state', handleChecklistState);
        socket.on('session_reset', () => {
            setTranscription(null);
            setSummary(null);
            setChecklist([]);
            setChecklistReleased(false);
            setRecordingState({ isRecording: false, interval: null });
        });

        return () => {
            socket.off('joined', handleJoined);
            socket.off('record_now', handleRecordNow);
            socket.off('stop_recording', handleStopRecording);
            socket.off('transcription_and_summary', handleTranscriptionAndSummary);
            socket.off('checkbox_update', handleCheckboxUpdate);
            socket.off('checklist_state', handleChecklistState);
            socket.off('session_reset');
        };
    }, [sessionInfo.group]);

    // Heartbeat
    useEffect(() => {
        if (!sessionInfo.code || !sessionInfo.group) return;

        const interval = setInterval(() => {
            if (socketRef.current?.connected) {
                socketRef.current.emit('heartbeat', {
                    session: sessionInfo.code,
                    group: sessionInfo.group
                });
            }
        }, 10000);

        return () => clearInterval(interval);
    }, [sessionInfo.code, sessionInfo.group]);

    const joinSession = useCallback((code, group) => {
        const normalizedCode = String(code || '').trim().toUpperCase();
        const parsedGroup = parseInt(group, 10);
        const token = joinTokenRef.current;

        if (socketRef.current && Number.isFinite(parsedGroup) && parsedGroup > 0 && (normalizedCode || token)) {
            joinStateRef.current = {
                code: normalizedCode || null,
                group: parsedGroup
            };
            socketRef.current.emit('join', token
                ? {
                    code: normalizedCode || undefined,
                    group: parsedGroup
                }
                : {
                    code: normalizedCode,
                    group: parsedGroup
                });
        }
    }, []);

    return {
        socket: socketRef.current,
        isConnected,
        sessionInfo,
        transcription,
        summary,
        checklist,
        setChecklist, // Allow fetching to update this
        checklistReleased,
        setChecklistReleased,
        error,
        recordingState,
        joinSession
    };
}
