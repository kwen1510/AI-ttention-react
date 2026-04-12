import React from 'react';
import { GraduationCap, LogOut, TimerReset } from 'lucide-react';
import { Panel } from '../../../components/ui/panel.jsx';
import { Badge, StatusBadge } from '../../../components/ui/badge.jsx';
import { Button } from '../../../components/ui/button.jsx';

export function StudentHeader({
    sessionCode,
    groupNumber,
    isConnected,
    isRecording,
    isPageVisible,
    elapsedTime,
    uploadState = null,
    onLeaveSession
}) {
    // Format elapsed time
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatClockTime = (timestamp) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const uploadPhase = uploadState?.phase || 'idle';
    let uploadTone = 'neutral';
    let uploadLabel = 'Ready for the first upload';

    if (uploadPhase === 'uploading') {
        uploadTone = 'primary';
        uploadLabel = uploadState?.pendingUploads > 1
            ? `Uploading ${uploadState.pendingUploads} audio chunks`
            : 'Uploading audio chunk';
    } else if (uploadPhase === 'finalizing') {
        uploadTone = 'warning';
        uploadLabel = 'Finalizing session audio';
    } else if (uploadPhase === 'error') {
        uploadTone = 'danger';
        uploadLabel = uploadState?.lastError || 'Upload issue';
    } else if (uploadState?.lastUploadedAt) {
        uploadTone = 'success';
        uploadLabel = `Last upload ${formatClockTime(uploadState.lastUploadedAt)}`;
    }

    const hasCompletedRecording = !isRecording && uploadPhase !== 'finalizing' && Boolean(uploadState?.lastUploadedAt);
    let recordingTone = 'neutral';
    let recordingLabel = 'Waiting for the teacher';

    if (isRecording) {
        recordingTone = isPageVisible ? 'danger' : 'warning';
        recordingLabel = isPageVisible ? 'Recording live' : 'Recording in background';
    } else if (uploadPhase === 'finalizing') {
        recordingTone = 'warning';
        recordingLabel = 'Wrapping up recording';
    } else if (hasCompletedRecording) {
        recordingTone = 'success';
        recordingLabel = 'Recording complete';
    }

    return (
        <Panel padding="lg" className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
                <div className="ui-panel-heading__icon">
                    <GraduationCap className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-[var(--text)]">AI(ttention)</h2>
                    <p className="text-sm copy-muted">
                        Session <span className="copy-strong session-code-text text-xs tracking-[0.16em]">{sessionCode || '-'}</span>
                        {' '}• Group <span className="copy-strong">{groupNumber || '-'}</span>
                    </p>
                </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                <StatusBadge tone={isConnected ? 'success' : 'danger'} pulse={isConnected}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                </StatusBadge>
                <Badge tone={recordingTone} icon={TimerReset}>{recordingLabel}</Badge>
                <Badge tone={uploadTone}>{uploadLabel}</Badge>
                {isRecording ? <Badge tone="primary">{formatTime(elapsedTime)}</Badge> : null}
                {onLeaveSession ? (
                    <Button type="button" variant="secondary" size="sm" onClick={onLeaveSession}>
                        <LogOut className="h-4 w-4" />
                        <span>Leave session</span>
                    </Button>
                ) : null}
            </div>
        </Panel>
    );
}
