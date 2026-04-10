import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../components/AuthContext.jsx';

export function useAdminSocket() {
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

        const socket = io({
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
            console.log('✅ Admin socket connected');
            if (sessionCodeRef.current) {
                socket.emit('admin_join', { code: sessionCodeRef.current });
            }
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            console.log('🔴 Admin socket disconnected');
        });

        socket.on('connect_error', (error) => {
            setIsConnected(false);
            console.warn('⚠️ Admin socket connection error:', error.message);
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

        const handleAdminUpdate = (data) => {
            setGroups(prev => {
                const newGroups = new Map(prev);
                const groupNum = data.group;

                const existing = newGroups.get(groupNum) || {
                    transcripts: [],
                    summary: null,
                    stats: {},
                    uploadErrors: 0,
                    uploadStatus: null,
                    isActive: true
                };

                // Update transcripts
                let newTranscripts = [...existing.transcripts];
                if (data.latestTranscript) {
                    newTranscripts.push({
                        text: data.latestTranscript,
                        timestamp: Date.now(),
                        duration: data.transcriptDuration || 0,
                        wordCount: data.transcriptWordCount || 0
                    });
                    // Keep last 10
                    if (newTranscripts.length > 10) newTranscripts = newTranscripts.slice(-10);
                }

                newGroups.set(groupNum, {
                    ...existing,
                    transcripts: newTranscripts,
                    cumulativeTranscript: data.cumulativeTranscript || existing.cumulativeTranscript,
                    summary: data.summary ? { text: data.summary, timestamp: Date.now() } : existing.summary,
                    stats: data.stats || existing.stats,
                    isActive: typeof data.isActive === 'boolean' ? data.isActive : existing.isActive,
                    lastUpdate: Date.now()
                });

                return newGroups;
            });
        };

        const handleUploadError = (data) => {
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
            console.warn(`Upload error in group ${data.group}:`, data.error);
        };

        const handleStudentJoined = ({ group }) => {
            setGroups(prev => {
                const newGroups = new Map(prev);
                const existing = newGroups.get(group) || {
                    transcripts: [],
                    summary: null,
                    stats: {},
                    uploadErrors: 0,
                    uploadStatus: null
                };

                newGroups.set(group, {
                    ...existing,
                    isActive: true,
                    lastUpdate: Date.now()
                });

                return newGroups;
            });
        };

        const handleUploadStatus = (data) => {
            setGroups(prev => {
                const newGroups = new Map(prev);
                const existing = newGroups.get(data.group) || {
                    transcripts: [],
                    summary: null,
                    stats: {},
                    uploadErrors: 0,
                    uploadStatus: null,
                    isActive: true
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
        };

        const handleStudentLeft = ({ group }) => {
            setGroups(prev => {
                const newGroups = new Map(prev);
                const existing = newGroups.get(group);
                if (!existing) {
                    return prev;
                }

                newGroups.set(group, {
                    ...existing,
                    isActive: false,
                    lastUpdate: Date.now()
                });

                return newGroups;
            });
        };

        socket.on('admin_update', handleAdminUpdate);
        socket.on('upload_error', handleUploadError);
        socket.on('upload_status', handleUploadStatus);
        socket.on('student_joined', handleStudentJoined);
        socket.on('student_left', handleStudentLeft);

        return () => {
            socket.off('admin_update', handleAdminUpdate);
            socket.off('upload_error', handleUploadError);
            socket.off('upload_status', handleUploadStatus);
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
        joinSession
    };
}
