import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../components/AuthContext.jsx';
import { createAppSocket } from '../lib/socketClient.js';
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
    const { session, isStagingBypass } = useAuth();
    const socketRef = useRef(null);
    const sessionCodeRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [sessionCode, setSessionCode] = useState(null);
    const [groups, setGroups] = useState(new Map());
    const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());

    useEffect(() => {
        sessionCodeRef.current = sessionCode;
    }, [sessionCode]);

    // Initialize socket connection
    useEffect(() => {
        if (!isStagingBypass && !session?.access_token) {
            return undefined;
        }

        const socket = createAppSocket({
            auth: isStagingBypass
                ? {
                    type: 'teacher',
                    stagingBypass: true
                }
                : {
                    type: 'teacher',
                    accessToken: session.access_token
                }
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            console.log('✅ Checkbox socket connected');
            if (sessionCodeRef.current) {
                socket.emit('admin_join', { code: sessionCodeRef.current });
            }
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            console.log('🔴 Checkbox socket disconnected');
        });

        socket.on('connect_error', (error) => {
            setIsConnected(false);
            console.warn('⚠️ Checkbox socket connection error:', error.message);
        });

        socket.on('admin_heartbeat_ack', () => {
            setLastHeartbeat(Date.now());
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [isStagingBypass, session?.access_token]);

    // Join session
    const joinSession = useCallback((code) => {
        const normalizedCode = String(code || '').trim().toUpperCase();
        if (socketRef.current && normalizedCode) {
            socketRef.current.emit('admin_join', { code: normalizedCode });
            setSessionCode(normalizedCode);
        }
    }, []);

    // Handle incoming updates
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;

        const handleCheckboxUpdate = (data) => {
            setGroups(prev => {
                const newGroups = new Map(prev);
                const groupNum = data.group;

                const existing = newGroups.get(groupNum) || {
                    transcripts: [],
                    checkboxes: [],
                    stats: {},
                    isReleased: false
                };

                // Update transcripts
                let newTranscripts = [...existing.transcripts];
                if (data.latestTranscript) {
                    // Avoid duplicates within 5 seconds
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

                // Update checkboxes
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
                            // Only update if not already completed correctly (green)
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

                // Initial load of existing transcripts
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
        };

        const handleChecklistState = (data) => {
            setGroups(prev => {
                const newGroups = new Map(prev);
                const groupNum = Number(data.groupNumber);
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
        };

        const handleStudentJoined = ({ group }) => {
            setGroups(prev => {
                const newGroups = new Map(prev);
                const existing = newGroups.get(group) || { transcripts: [], checkboxes: [], stats: {}, isReleased: false };
                newGroups.set(group, { ...existing, isActive: true });
                return newGroups;
            });
        };

        const handleStudentLeft = ({ group }) => {
            setGroups(prev => {
                const newGroups = new Map(prev);
                const existing = newGroups.get(group);
                if (!existing) {
                    return prev;
                }

                newGroups.set(group, { ...existing, isActive: false });
                return newGroups;
            });
        };

        socket.on('checkbox_update', handleCheckboxUpdate);
        socket.on('checklist_state', handleChecklistState);
        socket.on('student_joined', handleStudentJoined);
        socket.on('student_left', handleStudentLeft);

        return () => {
            socket.off('checkbox_update', handleCheckboxUpdate);
            socket.off('checklist_state', handleChecklistState);
            socket.off('student_joined', handleStudentJoined);
            socket.off('student_left', handleStudentLeft);
        };
    }, []);

    // Heartbeat logic
    useEffect(() => {
        if (!sessionCode) return;

        const heartbeatInterval = setInterval(() => {
            if (socketRef.current?.connected) {
                socketRef.current.emit('admin_heartbeat', { sessionCode });
            }
        }, 10000);

        const checkInterval = setInterval(() => {
            if (Date.now() - lastHeartbeat > 25000) {
                setIsConnected(false);
            } else {
                setIsConnected(true);
            }
        }, 3000);

        return () => {
            clearInterval(heartbeatInterval);
            clearInterval(checkInterval);
        };
    }, [sessionCode, lastHeartbeat]);

    return {
        socket: socketRef.current,
        isConnected,
        sessionCode,
        groups,
        setGroups, // Exported to allow manual updates (e.g. setting initial criteria)
        joinSession
    };
}
