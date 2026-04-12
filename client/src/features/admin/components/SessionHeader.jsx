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
            <Toolbar className="gap-3">
                <ToolbarGroup className="flex w-full flex-wrap items-end gap-3 lg:w-auto lg:flex-1">
                    <Button
                        onClick={onOpenQR}
                        type="button"
                        variant="secondary"
                        size="sm"
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

                    <Field label="Interval (sec)" htmlFor="sessionInterval" className="w-[8rem]">
                        <Input
                            id="sessionInterval"
                            type="number"
                            min={5}
                            max={120}
                            value={interval}
                            onChange={(e) => onIntervalChange(Number(e.target.value))}
                        />
                    </Field>
                </ToolbarGroup>

                <ToolbarGroup className="flex w-full flex-wrap gap-3 sm:w-auto sm:justify-end">
                    <Button
                        type="button"
                        onClick={onStartRecording}
                        disabled={isRecording}
                        variant="primary"
                        size="sm"
                        className="flex-1 sm:flex-none"
                    >
                        <Play className="h-4 w-4" />
                        <span>Start recording</span>
                    </Button>

                    <Button
                        type="button"
                        onClick={onStopRecording}
                        disabled={!isRecording}
                        variant="danger"
                        size="sm"
                        className="flex-1 sm:flex-none"
                    >
                        <Square className="h-4 w-4" />
                        <span>Stop recording</span>
                    </Button>
                </ToolbarGroup>
            </Toolbar>
        </div>
    );
}
