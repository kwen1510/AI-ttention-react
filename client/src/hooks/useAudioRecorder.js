import { useState, useEffect, useRef } from 'react';

export function useAudioRecorder(joinToken, groupNumber, onUploadError) {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const recordingTimerRef = useRef(null);
    const [isPageVisible, setIsPageVisible] = useState(true);

    // Handle visibility changes for background recording support
    useEffect(() => {
        const handleVisibilityChange = () => {
            setIsPageVisible(!document.hidden);
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        // Request wake lock if available
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen').catch(err => {
                console.warn("Could not acquire wake lock:", err);
            });
        }

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);

    const uploadChunk = async (blob) => {
        if (!joinToken || !groupNumber) return;

        const formData = new FormData();
        formData.append('file', blob, `chunk_${Date.now()}.webm`);
        formData.append('joinToken', joinToken);
        formData.append('groupNumber', groupNumber);

        try {
            const response = await fetch('/api/transcribe-chunk', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }
        } catch (err) {
            console.error('Upload error:', err);
            if (onUploadError) {
                onUploadError(err.message);
            }
        }
    };

    const startRecordingCycle = (intervalMs) => {
        if (!streamRef.current) return;

        // Overlap duration to prevent audio loss between chunks
        const overlapDuration = 1000;

        try {
            const options = { mimeType: 'audio/webm;codecs=opus' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'audio/webm';
            }

            const recorder = new MediaRecorder(streamRef.current, options);
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    uploadChunk(event.data);
                }
            };

            recorder.onstop = () => {
                if (isRecording) {
                    // If still recording, start next cycle (the overlap is handled by timing)
                    // Actually, the recursive logic in original script was:
                    // onstop -> if isRecording -> setTimeout(startRecordingCycle, 50)
                    // And the recorder was stopped after interval + overlap.
                    // This creates a chain of recorders.
                    setTimeout(() => startRecordingCycle(intervalMs), 50);
                }
            };

            recorder.start();

            // Stop this specific recorder instance after interval + overlap
            recordingTimerRef.current = setTimeout(() => {
                if (recorder.state === 'recording') {
                    recorder.stop();
                }
            }, intervalMs + overlapDuration);

        } catch (err) {
            console.error("Failed to start recording cycle:", err);
            if (onUploadError) onUploadError("Failed to start recording cycle");
        }
    };

    const startRecording = async (intervalMs) => {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Audio recording not supported");
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            streamRef.current = stream;
            setIsRecording(true);

            // Start the first cycle
            startRecordingCycle(intervalMs);

        } catch (err) {
            console.error("Failed to start recording:", err);
            if (onUploadError) onUploadError(err.message);
        }
    };

    const stopRecording = () => {
        setIsRecording(false);

        if (recordingTimerRef.current) {
            clearTimeout(recordingTimerRef.current);
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, []);

    // Watch for isRecording state change to trigger start/stop? 
    // No, better to expose start/stop functions.

    return {
        isRecording,
        startRecording,
        stopRecording,
        isPageVisible
    };
}
