import React from 'react';
import { Sparkles, Clock, Lock } from 'lucide-react';
import { Badge } from '../../../components/ui/badge.jsx';
import { EmptyState } from '../../../components/ui/empty-state.jsx';
import { Panel, PanelHeader } from '../../../components/ui/panel.jsx';

export function SummaryPanel({ summary, isReleased }) {
    return (
        <Panel padding="none" className="flex h-full flex-col overflow-hidden">
            <div className="p-5">
                <PanelHeader
                    icon={Sparkles}
                    title="Discussion summary"
                    description={isReleased ? "A rolling summary of the current conversation." : "Summary feedback stays hidden until your teacher releases it."}
                    actions={summary ? <Badge tone="accent" icon={Clock}>Updated just now</Badge> : null}
                />
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5">
                {!isReleased ? (
                    <EmptyState
                        icon={Lock}
                        title="Summary not released yet"
                        description="Your teacher can release the live summary when it is the right time for your group."
                    />
                ) : !summary ? (
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
