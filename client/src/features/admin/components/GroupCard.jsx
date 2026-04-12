import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, ScrollText, UploadCloud, Send, Check } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Panel, PanelHeader } from '../../../components/ui/panel.jsx';
import { StatusBadge, Badge } from '../../../components/ui/badge.jsx';

export function GroupCard({ groupNumber, data, onRelease }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const transcriptPanelId = useId();

    // Format summary text with HTML-like structure
    const formatSummary = (text) => {
        if (!text) return null;
        return text.split('\n').map((line, i) => (
            <p key={i} className="mb-2">{line}</p>
        ));
    };

    const formatClockTime = (timestamp) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const uploadStatus = data.uploadStatus || null;
    let statusTone = data.isActive ? 'success' : 'neutral';
    let statusLabel = data.isActive ? 'Connected' : 'Waiting';
    let uploadTone = 'neutral';
    let uploadLabel = 'Awaiting first upload';

    if (uploadStatus?.phase === 'uploading') {
        statusTone = 'primary';
        statusLabel = 'Uploading';
        uploadTone = 'primary';
        uploadLabel = uploadStatus.pendingUploads > 1
            ? `${uploadStatus.pendingUploads} chunks in flight`
            : 'Chunk upload in progress';
    } else if (uploadStatus?.phase === 'finalizing') {
        statusTone = 'warning';
        statusLabel = 'Finalizing';
        uploadTone = 'warning';
        uploadLabel = 'Waiting for the final chunk to finish';
    } else if (uploadStatus?.phase === 'error') {
        statusTone = 'danger';
        statusLabel = 'Upload issue';
        uploadTone = 'danger';
        uploadLabel = uploadStatus.lastError || 'Chunk upload failed';
    } else if (uploadStatus?.lastUploadedAt) {
        uploadTone = 'success';
        uploadLabel = `Last upload ${formatClockTime(uploadStatus.lastUploadedAt)}`;
    }

    return (
        <Panel padding="lg" className="h-full">
            <PanelHeader
                icon={MessageSquare}
                title={`Group ${groupNumber}`}
                description={`${data.transcripts.length} transcript segments`}
                actions={(
                    <Button
                        type="button"
                        onClick={() => onRelease?.(groupNumber)}
                        size="sm"
                        variant={data.isReleased ? 'secondary' : 'primary'}
                        disabled={!onRelease || Boolean(data.isReleased)}
                    >
                        {data.isReleased ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                        <span>{data.isReleased ? 'Released' : 'Release summary'}</span>
                    </Button>
                )}
            >
                <div className="cluster mt-2">
                    <Badge tone="neutral">{groupNumber}</Badge>
                    <StatusBadge tone={statusTone} pulse={statusTone !== 'neutral'}>
                        {statusLabel}
                    </StatusBadge>
                    <StatusBadge tone={data.isReleased ? 'success' : 'warning'}>
                        {data.isReleased ? 'Visible to students' : 'Not released'}
                    </StatusBadge>
                </div>
            </PanelHeader>

            <div className="mt-6 space-y-6">
                <section className="surface-list">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <UploadCloud className="h-4 w-4 text-[var(--primary)]" />
                            <h4 className="text-sm font-semibold text-[var(--text)]">Upload status</h4>
                        </div>
                        <Badge tone={uploadTone} size="sm">{uploadLabel}</Badge>
                    </div>
                    {data.uploadErrors ? (
                        <div className="surface-list__item text-sm text-[var(--text)]">
                            {data.uploadErrors} upload issue{data.uploadErrors === 1 ? '' : 's'} reported for this group.
                        </div>
                    ) : null}
                </section>

                <section className="surface-list">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-[var(--accent)]" />
                        <h4 className="text-sm font-semibold text-[var(--text)]">Live summary</h4>
                    </div>
                    {data.summary ? (
                        <div className="surface-list__item space-y-2 text-sm text-[var(--text)]">
                            {formatSummary(data.summary.text)}
                        </div>
                    ) : (
                        <div className="surface-list__item text-sm">No summary available yet.</div>
                    )}
                </section>

                <section className="surface-list">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <ScrollText className="h-4 w-4 text-[var(--primary)]" />
                            <h4 className="text-sm font-semibold text-[var(--text)]">Transcript</h4>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-expanded={isExpanded}
                            aria-controls={transcriptPanelId}
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <span>{isExpanded ? 'Hide transcript' : 'Show transcript'}</span>
                        </Button>
                    </div>

                    {isExpanded ? (
                        <div id={transcriptPanelId} className="max-h-60 space-y-3 overflow-y-auto">
                            {data.cumulativeTranscript ? (
                                <div className="surface-list__item text-sm text-[var(--text)] whitespace-pre-wrap">
                                    {data.cumulativeTranscript}
                                </div>
                            ) : (
                                data.transcripts.slice().reverse().map((t, i) => (
                                    <div key={i} className="surface-list__item text-sm">
                                        <p className="copy-strong">{t.text}</p>
                                        <div className="mt-2 text-xs copy-muted">
                                            {new Date(t.timestamp).toLocaleTimeString()}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="surface-list__item text-sm">Expand to review the transcript history.</div>
                    )}
                </section>
            </div>
        </Panel>
    );
}
