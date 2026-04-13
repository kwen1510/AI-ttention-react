import React from 'react';
import { CheckSquare, Clock, CheckCircle, Circle } from 'lucide-react';
import { Badge } from '../../../components/ui/badge.jsx';
import { EmptyState } from '../../../components/ui/empty-state.jsx';
import { MarkdownContent } from '../../../components/ui/markdown.jsx';
import { Panel, PanelHeader } from '../../../components/ui/panel.jsx';
import {
    getChecklistItemClassName,
    getChecklistStatusClassName,
    getChecklistStatusLabel,
    normalizeChecklistStatus
} from '../../../lib/statusTone.js';

export function ChecklistPanel({ checklist, isReleased }) {
    if (!isReleased) {
        return (
            <Panel padding="none" className="flex h-full flex-col overflow-hidden">
                <div className="p-5">
                    <PanelHeader
                        icon={CheckSquare}
                        title="Discussion checklist"
                        description="Checklist feedback appears here after your teacher releases it."
                    />
                </div>
                <div className="flex-1 px-5 pb-5">
                    <EmptyState
                        icon={Clock}
                        title="Waiting for the checklist"
                        description="Once released, the criteria and your group's progress will appear here."
                    />
                </div>
            </Panel>
        );
    }

    if (!checklist || checklist.length === 0) {
        return (
            <Panel padding="none" className="flex h-full flex-col overflow-hidden">
                <div className="p-5">
                    <PanelHeader
                        icon={CheckSquare}
                        title="Group checklist"
                        description="Live checklist progress for your group."
                    />
                </div>
                <div className="flex-1 px-5 pb-5">
                    <EmptyState
                        icon={CheckSquare}
                        title="Checklist unavailable"
                        description="The checklist was released, but no criteria are available yet."
                    />
                </div>
            </Panel>
        );
    }

    return (
        <Panel padding="none" className="flex h-full flex-col overflow-hidden">
            <div className="p-5">
                <PanelHeader
                    icon={CheckSquare}
                    title="Group checklist"
                    description="Live checklist progress for your group."
                    actions={<Badge tone="success">Live updates</Badge>}
                />
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-5">
                {checklist.map((item, index) => {
                    const normalizedStatus = normalizeChecklistStatus(item.status);
                    const isMet = normalizedStatus === 'green';

                    return (
                        <div key={index} className={`${getChecklistItemClassName(item.status)} flex items-start gap-3 transition-all duration-300`}>
                            <div className="mt-1 flex-shrink-0">
                                {isMet ? (
                                    <CheckCircle className="h-5 w-5 text-[var(--success)]" />
                                ) : normalizedStatus === 'red' ? (
                                    <Circle className="h-5 w-5 text-[var(--danger)]" />
                                ) : (
                                    <Circle className="h-5 w-5 text-[var(--text-muted)]" />
                                )}
                            </div>
                            <div className="flex-1 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm font-medium text-[var(--text)]">
                                        {item.description}
                                    </p>
                                    <span className={getChecklistStatusClassName(item.status)}>
                                        {getChecklistStatusLabel(item.status)}
                                    </span>
                                </div>
                                {item.rubric && (
                                    <div className="text-xs copy-muted italic">
                                        <span className="font-medium">Rubric:</span>{' '}
                                        <MarkdownContent content={item.rubric} inline />
                                    </div>
                                )}
                                {item.quote && (
                                    <div className="checklist-item__quote text-xs text-[var(--text)]">
                                        <MarkdownContent content={item.quote} />
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Panel>
    );
}
