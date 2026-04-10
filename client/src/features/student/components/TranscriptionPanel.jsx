import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, UploadCloud } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Badge } from '../../../components/ui/badge.jsx';
import { EmptyState } from '../../../components/ui/empty-state.jsx';
import { Panel, PanelHeader } from '../../../components/ui/panel.jsx';

export function TranscriptionPanel({ transcription, uploadState = null }) {
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const scrollRef = useRef(null);

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
    let uploadLabel = 'Waiting to upload';

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
        uploadLabel = `Uploaded at ${formatClockTime(uploadState.lastUploadedAt)}`;
    }

    // Update history when new transcription arrives
    useEffect(() => {
        if (transcription) {
            setHistory(prev => [transcription, ...prev].slice(0, 50)); // Keep last 50
        }
    }, [transcription]);

    return (
        <Panel padding="none" className="flex h-full flex-col overflow-hidden">
            <div className="p-5">
                <PanelHeader
                    icon={MessageSquare}
                    title="Live transcription"
                    description="Audio chunks appear here as they are transcribed."
                    actions={(
                        <div className="flex items-center gap-2">
                            <Badge tone={uploadTone} size="sm" icon={UploadCloud}>
                                {uploadLabel}
                            </Badge>
                            <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
                                {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                <span>{showHistory ? 'Hide history' : 'Show history'}</span>
                            </Button>
                        </div>
                    )}
                />
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5" ref={scrollRef}>
                {!transcription && history.length === 0 ? (
                    <EmptyState
                        icon={MessageSquare}
                        title="No transcription yet"
                        description="Audio will appear here once recording starts."
                    />
                ) : (
                    <div className="space-y-4">
                        {transcription && (
                            <div className="ui-panel ui-panel--subtle ui-panel--pad-md">
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <Badge tone="primary" size="sm">Latest</Badge>
                                    <span className="text-xs copy-muted">Just now</span>
                                </div>
                                <div className="copy-strong leading-relaxed">
                                    {transcription.cumulativeText || transcription.text}
                                </div>
                                {transcription.text && (
                                    <div className="mt-3 border-t border-[var(--border)] pt-3 text-xs copy-muted">
                                        <span className="font-medium">Chunk:</span> "{transcription.text}"
                                    </div>
                                )}
                            </div>
                        )}

                        {showHistory && history.map((item, index) => (
                            <div key={index} className="surface-list__item text-sm">
                                <div className="copy-strong">
                                    {item.cumulativeText || item.text}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Panel>
    );
}
