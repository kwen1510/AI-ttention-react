import React from 'react';
import { GraduationCap, TimerReset } from 'lucide-react';
import { Panel } from '../../../components/ui/panel.jsx';
import { Badge, StatusBadge } from '../../../components/ui/badge.jsx';

export function StudentHeader({
    sessionCode,
    groupNumber,
    isConnected,
    isRecording,
    isPageVisible,
    elapsedTime,
    uploadState = null
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
    let uploadLabel = 'Awaiting first upload';

    if (uploadPhase === 'uploading') {
        uploadTone = 'primary';
        uploadLabel = uploadState?.pendingUploads > 1
            ? `Uploading ${uploadState.pendingUploads} chunks`
            : 'Uploading chunk';
    } else if (uploadPhase === 'finalizing') {
        uploadTone = 'warning';
        uploadLabel = 'Finalizing last chunk';
    } else if (uploadPhase === 'error') {
        uploadTone = 'danger';
        uploadLabel = uploadState?.lastError || 'Upload failed';
    } else if (uploadState?.lastUploadedAt) {
        uploadTone = 'success';
        uploadLabel = `Last upload ${formatClockTime(uploadState.lastUploadedAt)}`;
    }

    return (
        <Panel padding="lg" className="flex flex-wrap items-center justify-between gap-4">
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

            <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge tone={isConnected ? 'success' : 'danger'} pulse={isConnected}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                </StatusBadge>
                <Badge
                    tone={isRecording ? (isPageVisible ? 'danger' : 'warning') : 'neutral'}
                    icon={TimerReset}
                >
                    {isRecording
                        ? (isPageVisible ? 'Recording live' : 'Recording in background')
                        : 'Waiting for teacher'}
                </Badge>
                <Badge tone={uploadTone}>{uploadLabel}</Badge>
                <Badge tone="primary">{formatTime(elapsedTime)}</Badge>
            </div>
        </Panel>
    );
}
