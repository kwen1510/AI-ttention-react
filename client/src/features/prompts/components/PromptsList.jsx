import React from 'react';
import { Globe, Lock, FileText, CheckSquare, Eye, Play } from 'lucide-react';
import { Badge } from '../../../components/ui/badge.jsx';
import { EmptyState } from '../../../components/ui/empty-state.jsx';
import { Panel } from '../../../components/ui/panel.jsx';

export function PromptsList({ prompts, onView }) {
    if (prompts.length === 0) {
        return (
            <EmptyState
                icon={FileText}
                title="No prompts found"
                description="Create your first prompt to start building a reusable library."
            />
        );
    }

    const modeTones = {
        summary: 'primary',
        checkbox: 'success'
    };

    const modeIcons = {
        summary: FileText,
        checkbox: CheckSquare
    };

    const formatDate = (value) => {
        if (!value) return 'Unknown date';
        try {
            return new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }).format(new Date(value));
        } catch {
            return String(value);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {prompts.map(prompt => {
                const ModeIcon = modeIcons[prompt.mode] || FileText;
                const viewCount = Number(prompt.views) || 0;
                const usageCount = Number(prompt.usage_count) || 0;
                const hasEngagement = viewCount > 0 || usageCount > 0;
                const authorLabel = prompt.authorName || 'Anonymous Teacher';

                return (
                    <Panel
                        key={prompt._id}
                        padding="lg"
                        onClick={() => onView(prompt)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onView(prompt);
                            }
                        }}
                        role="button"
                        tabIndex={0}
                        className="flex h-full cursor-pointer flex-col transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)]"
                    >
                        <div className="flex-1">
                            <div className="mb-4">
                                <div className="min-w-0">
                                    <h3 className="mb-2 truncate text-lg font-semibold text-[var(--text)]" title={prompt.title}>
                                        {prompt.title}
                                    </h3>
                                    <p className="mb-3 line-clamp-2 text-sm">
                                        {prompt.description || 'No description provided'}
                                    </p>
                                </div>
                            </div>

                            <div className="mb-4 flex flex-wrap items-center gap-2">
                                <Badge tone={modeTones[prompt.mode] || 'neutral'} size="sm" icon={ModeIcon}>
                                    {prompt.mode.charAt(0).toUpperCase() + prompt.mode.slice(1)}
                                </Badge>
                                <Badge tone="neutral" size="sm">
                                    {prompt.category}
                                </Badge>
                                <Badge tone={prompt.isPublic ? 'success' : 'neutral'} size="sm" icon={prompt.isPublic ? Globe : Lock}>
                                    {prompt.isPublic ? 'Shared' : 'Private'}
                                </Badge>
                            </div>

                            {prompt.tags && prompt.tags.length > 0 && (
                                <div className="mb-4 flex flex-wrap gap-1.5">
                                    {prompt.tags.slice(0, 2).map((tag, idx) => (
                                        <Badge key={idx} tone="accent" size="sm">
                                            {tag}
                                        </Badge>
                                    ))}
                                    {prompt.tags.length > 2 && (
                                        <span className="flex items-center text-xs copy-muted">
                                            +{prompt.tags.length - 2} more
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex items-end justify-between gap-4 border-t border-[var(--border)] pt-4">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-[var(--text)]">
                                    {authorLabel}
                                </div>
                                <div className="text-xs copy-muted">
                                    {formatDate(prompt.created_at)}
                                </div>
                            </div>
                            {hasEngagement ? (
                                <div className="flex shrink-0 items-center gap-4 text-xs copy-muted">
                                    {viewCount > 0 ? (
                                        <span className="flex items-center" title="Views">
                                            <Eye className="mr-1 h-4 w-4" />
                                            {viewCount}
                                        </span>
                                    ) : null}
                                    {usageCount > 0 ? (
                                        <span className="flex items-center" title="Uses">
                                            <Play className="mr-1 h-4 w-4" />
                                            {usageCount}
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </Panel>
                );
            })}
        </div>
    );
}
