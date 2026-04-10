import { useCallback, useEffect, useRef, useState } from 'react';

const INITIAL_UPLOAD_STATE = {
    phase: 'idle',
    pendingUploads: 0,
    lastChunkSize: 0,
    lastUploadedAt: null,
    lastError: null
};

export function useAudioRecorder(sessionCode, groupNumber, socket, onUploadError, joinToken = '') {
    const [isRecording, setIsRecording] = useState(false);
    const [isPageVisible, setIsPageVisible] = useState(true);
    const [uploadState, setUploadState] = useState(INITIAL_UPLOAD_STATE);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const wakeLockRef = useRef(null);
    const sessionRef = useRef({
        sessionCode,
        groupNumber,
        joinToken,
        socket
    });
    const isRecordingRef = useRef(false);
    const pendingUploadsRef = useRef(0);
    const stopRequestedRef = useRef(false);

    useEffect(() => {
        sessionRef.current = {
            sessionCode,
            groupNumber,
            joinToken,
            socket
        };
    }, [groupNumber, joinToken, sessionCode, socket]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            setIsPageVisible(!document.hidden);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const requestWakeLock = async () => {
            if (!('wakeLock' in navigator)) {
                return;
            }

            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
            } catch (error) {
                if (!cancelled) {
                    console.warn('Could not acquire wake lock:', error);
                }
            }
        };

        requestWakeLock();

        return () => {
            cancelled = true;
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {});
                wakeLockRef.current = null;
            }
        };
    }, []);

    const emitUploadStatus = useCallback((status) => {
        const {
            sessionCode: currentSessionCode,
            groupNumber: currentGroupNumber,
            socket: currentSocket
        } = sessionRef.current;

        const parsedGroup = Number(currentGroupNumber);
        if (!currentSocket?.connected || !Number.isFinite(parsedGroup) || parsedGroup <= 0) {
            return;
        }

        currentSocket.emit('upload_status', {
            session: currentSessionCode || undefined,
            group: parsedGroup,
            phase: status.phase,
            pendingUploads: status.pendingUploads,
            chunkSize: status.lastChunkSize,
            lastUploadedAt: status.lastUploadedAt,
            lastError: status.lastError,
            timestamp: Date.now()
        });
    }, []);

    const publishUploadState = useCallback((updater) => {
        setUploadState((previous) => {
            const next = typeof updater === 'function'
                ? updater(previous)
                : {
                    ...previous,
                    ...updater
                };

            emitUploadStatus(next);
            return next;
        });
    }, [emitUploadStatus]);

    const cleanupStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        mediaRecorderRef.current = null;
    }, []);

    const uploadChunk = useCallback(async (blob) => {
        const {
            sessionCode: currentSessionCode,
            groupNumber: currentGroupNumber,
            joinToken: currentJoinToken,
            socket: currentSocket
        } = sessionRef.current;

        if ((!currentSessionCode && !currentJoinToken) || !currentGroupNumber || !blob?.size) {
            return;
        }

        const parsedGroup = Number(currentGroupNumber);
        const chunkSize = blob.size;
        pendingUploadsRef.current += 1;

        publishUploadState((previous) => ({
            ...previous,
            phase: stopRequestedRef.current ? 'finalizing' : 'uploading',
            pendingUploads: pendingUploadsRef.current,
            lastChunkSize: chunkSize,
            lastError: null
        }));

        const formData = new FormData();
        formData.append('file', blob, `chunk_${Date.now()}.webm`);
        if (currentSessionCode) {
            formData.append('sessionCode', currentSessionCode);
        }
        if (currentJoinToken) {
            formData.append('joinToken', currentJoinToken);
        }
        formData.append('groupNumber', parsedGroup);

        try {
            const response = await fetch('/api/transcribe-chunk', {
                method: 'POST',
                body: formData
            });

            let payload = null;
            try {
                payload = await response.json();
            } catch {
                payload = null;
            }

            if (!response.ok) {
                throw new Error(payload?.error || `Upload failed: ${response.status}`);
            }

            pendingUploadsRef.current = Math.max(0, pendingUploadsRef.current - 1);

            publishUploadState((previous) => ({
                ...previous,
                phase: stopRequestedRef.current
                    ? (pendingUploadsRef.current > 0 ? 'finalizing' : 'idle')
                    : (pendingUploadsRef.current > 0 ? 'uploading' : 'recording'),
                pendingUploads: pendingUploadsRef.current,
                lastChunkSize: chunkSize,
                lastUploadedAt: Date.now(),
                lastError: null
            }));

            if (onUploadError) {
                onUploadError(null);
            }
        } catch (error) {
            const message = error?.message || 'Upload failed';
            pendingUploadsRef.current = Math.max(0, pendingUploadsRef.current - 1);

            console.error('Upload error:', error);
            publishUploadState((previous) => ({
                ...previous,
                phase: stopRequestedRef.current && pendingUploadsRef.current > 0 ? 'finalizing' : 'error',
                pendingUploads: pendingUploadsRef.current,
                lastChunkSize: chunkSize,
                lastError: message
            }));

            if (currentSocket?.connected && Number.isFinite(parsedGroup) && parsedGroup > 0) {
                currentSocket.emit('upload_error', {
                    session: currentSessionCode || undefined,
                    group: parsedGroup,
                    error: message,
                    chunkSize,
                    timestamp: Date.now()
                });
            }

            if (onUploadError) {
                onUploadError(message);
            }
        }
    }, [onUploadError, publishUploadState]);

    const startRecording = useCallback(async (intervalMs) => {
        if (isRecordingRef.current || mediaRecorderRef.current) {
            return;
        }

        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Audio recording not supported');
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            const options = { mimeType: 'audio/webm;codecs=opus' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'audio/webm';
            }

            const recorder = new MediaRecorder(stream, options);
            streamRef.current = stream;
            mediaRecorderRef.current = recorder;
            isRecordingRef.current = true;
            stopRequestedRef.current = false;
            pendingUploadsRef.current = 0;
            setIsRecording(true);

            publishUploadState({
                ...INITIAL_UPLOAD_STATE,
                phase: 'recording'
            });

            recorder.onstart = () => {
                const {
                    sessionCode: currentSessionCode,
                    groupNumber: currentGroupNumber,
                    socket: currentSocket
                } = sessionRef.current;

                if (currentSocket?.connected && currentGroupNumber) {
                    currentSocket.emit('recording_started', {
                        session: currentSessionCode || undefined,
                        group: Number(currentGroupNumber)
                    });
                }
            };

            recorder.ondataavailable = (event) => {
                if (event.data?.size > 0) {
                    void uploadChunk(event.data);
                }
            };

            recorder.onerror = (event) => {
                const message = event?.error?.message || 'Recording failed';
                console.error('Recorder error:', event?.error || event);
                publishUploadState((previous) => ({
                    ...previous,
                    phase: 'error',
                    lastError: message
                }));
                if (onUploadError) {
                    onUploadError(message);
                }
            };

            recorder.onstop = () => {
                isRecordingRef.current = false;
                setIsRecording(false);
                cleanupStream();

                publishUploadState((previous) => ({
                    ...previous,
                    phase: pendingUploadsRef.current > 0 ? 'finalizing' : 'idle',
                    pendingUploads: pendingUploadsRef.current
                }));
            };

            recorder.start(Math.max(5_000, Number(intervalMs) || 30_000));
        } catch (error) {
            console.error('Failed to start recording:', error);
            publishUploadState({
                ...INITIAL_UPLOAD_STATE,
                phase: 'error',
                lastError: error.message
            });
            if (onUploadError) {
                onUploadError(error.message);
            }
        }
    }, [cleanupStream, onUploadError, publishUploadState, uploadChunk]);

    const stopRecording = useCallback(() => {
        stopRequestedRef.current = true;
        isRecordingRef.current = false;

        publishUploadState((previous) => ({
            ...previous,
            phase: 'finalizing'
        }));

        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
            return;
        }

        cleanupStream();
        setIsRecording(false);
        publishUploadState((previous) => ({
            ...previous,
            phase: pendingUploadsRef.current > 0 ? 'finalizing' : 'idle',
            pendingUploads: pendingUploadsRef.current
        }));
    }, [cleanupStream, publishUploadState]);

    useEffect(() => {
        return () => {
            stopRequestedRef.current = true;
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state !== 'inactive') {
                recorder.stop();
            } else {
                cleanupStream();
            }
        };
    }, [cleanupStream]);

    return {
        isRecording,
        startRecording,
        stopRecording,
        isPageVisible,
        uploadState
    };
}
