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

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {prompts.map(prompt => {
                const ModeIcon = modeIcons[prompt.mode] || FileText;

                return (
                    <Panel
                        key={prompt._id}
                        padding="lg"
                        onClick={() => onView(prompt)}
                        className="flex h-full cursor-pointer flex-col transition-transform hover:-translate-y-0.5"
                    >
                        <div className="flex-1">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex-1 min-w-0 mr-4">
                                    <h3 className="mb-2 truncate text-lg font-semibold text-[var(--text)]" title={prompt.title}>
                                        {prompt.title}
                                    </h3>
                                    <p className="mb-3 line-clamp-2 text-sm">
                                        {prompt.description || 'No description provided'}
                                    </p>
                                </div>
                                <div className="flex-shrink-0">
                                    {prompt.isPublic ? (
                                        <Globe className="h-4 w-4 text-[var(--success)]" title="Public" />
                                    ) : (
                                        <Lock className="h-4 w-4 text-[var(--text-muted)]" title="Private" />
                                    )}
                                </div>
                            </div>

                            <div className="mb-4 flex items-center gap-2">
                                <Badge tone={modeTones[prompt.mode] || 'neutral'} size="sm" icon={ModeIcon}>
                                    {prompt.mode.charAt(0).toUpperCase() + prompt.mode.slice(1)}
                                </Badge>
                                <Badge tone="neutral" size="sm">
                                    {prompt.category}
                                </Badge>
                            </div>

                            {prompt.tags && prompt.tags.length > 0 && (
                                <div className="mb-4 flex flex-wrap gap-1.5">
                                    {prompt.tags.slice(0, 3).map((tag, idx) => (
                                        <Badge key={idx} tone="accent" size="sm">
                                            {tag}
                                        </Badge>
                                    ))}
                                    {prompt.tags.length > 3 && (
                                        <span className="flex items-center text-xs copy-muted">
                                            +{prompt.tags.length - 3} more
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-4 text-sm copy-muted">
                            <div className="flex items-center gap-4">
                                <span className="flex items-center" title="Views">
                                    <Eye className="mr-1 h-4 w-4" />
                                    {prompt.views || 0}
                                </span>
                                <span className="flex items-center" title="Uses">
                                    <Play className="mr-1 h-4 w-4" />
                                    {prompt.usage_count || 0}
                                </span>
                            </div>
                            <div className="text-right">
                                <div className="max-w-[100px] truncate font-medium text-[var(--text)]">
                                    {prompt.authorName || 'Anonymous'}
                                </div>
                                <div className="text-xs">
                                    {new Date(prompt.created_at).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                    </Panel>
                );
            })}
        </div>
    );
}
