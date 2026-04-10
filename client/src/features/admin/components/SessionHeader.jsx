import React from 'react';
import { Play, Square, QrCode } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Field, Input } from '../../../components/ui/field.jsx';
import { StatusBadge } from '../../../components/ui/badge.jsx';
import { Toolbar, ToolbarGroup } from '../../../components/ui/toolbar.jsx';

export function SessionHeader({
    sessionCode,
    isConnected,
    isRecording,
    onStartRecording,
    onStopRecording,
    onOpenQR,
    interval,
    onIntervalChange
}) {
    return (
        <div className="page-shell page-shell--fluid pb-0">
            <Toolbar>
                <ToolbarGroup className="flex-1">
                    <Button
                        onClick={onOpenQR}
                        variant="secondary"
                        size="md"
                        className="min-h-touch h-auto min-w-[11rem] items-center justify-between px-3 py-2.5"
                    >
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                            Session
                        </span>
                        <span className="session-code-text text-sm font-semibold tracking-[0.18em]">
                            {sessionCode || '------'}
                        </span>
                        <QrCode className="h-4 w-4 text-[var(--primary)]" />
                    </Button>

                    <StatusBadge tone={isConnected ? 'success' : 'danger'} pulse={isConnected}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </StatusBadge>

                    <Field label="Interval" className="w-full max-w-[8rem]">
                        <Input
                            type="number"
                            min={5}
                            max={120}
                            value={interval}
                            onChange={(e) => onIntervalChange(Number(e.target.value))}
                        />
                    </Field>
                </ToolbarGroup>

                <ToolbarGroup>
                    <Button onClick={onStartRecording} disabled={isRecording} variant="primary">
                        <Play className="h-4 w-4" />
                        <span>Start recording</span>
                    </Button>

                    <Button onClick={onStopRecording} disabled={!isRecording} variant="danger">
                        <Square className="h-4 w-4" />
                        <span>Stop recording</span>
                    </Button>
                </ToolbarGroup>
            </Toolbar>
        </div>
    );
}
