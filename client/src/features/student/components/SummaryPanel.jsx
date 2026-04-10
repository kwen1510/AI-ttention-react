import React from 'react';
import { Sparkles, Clock } from 'lucide-react';
import { Badge } from '../../../components/ui/badge.jsx';
import { EmptyState } from '../../../components/ui/empty-state.jsx';
import { Panel, PanelHeader } from '../../../components/ui/panel.jsx';

export function SummaryPanel({ summary }) {
    return (
        <Panel padding="none" className="flex h-full flex-col overflow-hidden">
            <div className="p-5">
                <PanelHeader
                    icon={Sparkles}
                    title="Discussion summary"
                    description="A rolling summary of the current conversation."
                    actions={summary ? <Badge tone="accent" icon={Clock}>Updated just now</Badge> : null}
                />
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5">
                {!summary ? (
                    <EmptyState
                        icon={Sparkles}
                        title="No summary yet"
                        description="A running summary will appear here as the discussion develops."
                    />
                ) : (
                    <div className="ui-panel ui-panel--subtle ui-panel--pad-lg h-full">
                        <div className="copy-strong leading-relaxed whitespace-pre-line">{summary}</div>
                    </div>
                )}
            </div>
        </Panel>
    );
}
