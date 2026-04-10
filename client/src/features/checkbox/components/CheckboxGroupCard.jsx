import React, { useState } from 'react';
import { CheckCircle, Circle, ChevronDown, ChevronUp, Send, Check, ClipboardList } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Panel, PanelHeader } from '../../../components/ui/panel.jsx';
import { Badge, StatusBadge } from '../../../components/ui/badge.jsx';
import { getChecklistTone } from '../../../lib/statusTone.js';

export function CheckboxGroupCard({ groupNumber, data, onRelease }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const completedCount = data.checkboxes.filter(c => c.completed).length;
    const totalCount = data.checkboxes.length;
    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return (
        <Panel padding="lg" className="h-full">
            <PanelHeader
                icon={ClipboardList}
                title={`Group ${groupNumber}`}
                description={`${completedCount}/${totalCount} criteria completed`}
                actions={(
                    <Button
                        onClick={() => onRelease(groupNumber)}
                        size="sm"
                        variant={data.isReleased ? 'secondary' : 'primary'}
                    >
                        {data.isReleased ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                        <span>{data.isReleased ? 'Released' : 'Release checklist'}</span>
                    </Button>
                )}
            >
                <div className="cluster mt-2">
                    <Badge tone="neutral">{groupNumber}</Badge>
                    <StatusBadge tone={data.isReleased ? 'success' : 'warning'}>
                        {data.isReleased ? 'Visible to students' : 'Not released'}
                    </StatusBadge>
                </div>
            </PanelHeader>

            <div className="mt-6 space-y-6">
                <section>
                    <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="copy-muted">Progress</span>
                        <span className="copy-strong">{completionRate}%</span>
                    </div>
                    <div className="ui-progress">
                        <div className="ui-progress__fill" style={{ width: `${completionRate}%` }} />
                    </div>
                </section>

                <div className="space-y-3">
                    {data.checkboxes.map((checkbox) => {
                        const tone = getChecklistTone(checkbox.status);
                        return (
                            <div key={checkbox.id} className="surface-list__item flex items-start gap-3">
                                <div className="mt-0.5 flex-shrink-0">
                                    {checkbox.completed ? (
                                        <CheckCircle className="h-5 w-5 text-[var(--success)]" />
                                    ) : (
                                        <Circle className="h-5 w-5 text-[var(--text-muted)]" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <p className="text-sm font-medium text-[var(--text)]">
                                            {checkbox.description}
                                        </p>
                                        <Badge tone={tone} size="sm">
                                            {checkbox.status || 'pending'}
                                        </Badge>
                                    </div>
                                    <p className="text-xs copy-muted">Rubric: {checkbox.rubric}</p>
                                    {checkbox.quote ? (
                                        <div className="ui-panel ui-panel--subtle ui-panel--pad-sm text-xs text-[var(--text)]">
                                            "{checkbox.quote}"
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {data.transcripts.length > 0 && (
                    <section className="surface-list">
                        <div className="flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-[var(--text)]">
                                Discussion transcript ({data.transcripts.length})
                            </h4>
                            <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                <span>{isExpanded ? 'Show less' : 'Show full transcript'}</span>
                            </Button>
                        </div>

                        <div className="surface-list__item text-sm">
                            <div className="mb-2 flex items-center justify-between">
                                <Badge tone="primary" size="sm">Latest</Badge>
                                <span className="text-xs copy-muted">Segment {data.transcripts.length}</span>
                            </div>
                            <div className="copy-strong whitespace-pre-wrap break-words">
                                {data.transcripts[data.transcripts.length - 1].text}
                            </div>
                        </div>

                        {isExpanded ? (
                            <div className="surface-list__item text-sm copy-strong whitespace-pre-wrap break-words">
                                {data.transcripts.map(t => t.text).join(' ')}
                            </div>
                        ) : null}
                    </section>
                )}
            </div>
        </Panel>
    );
}
