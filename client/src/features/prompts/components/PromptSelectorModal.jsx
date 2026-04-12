import React, { useEffect, useMemo, useState } from 'react';
import { FileText, CheckSquare, Search, Play, RefreshCw, X } from 'lucide-react';
import { Alert } from '../../../components/ui/alert.jsx';
import { Badge } from '../../../components/ui/badge.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog.jsx';
import { EmptyState } from '../../../components/ui/empty-state.jsx';
import { Field, Input } from '../../../components/ui/field.jsx';
import { Panel } from '../../../components/ui/panel.jsx';
import { getSummaryPromptPreview, parseCheckboxPromptContent } from '../../../lib/prompts.js';

const modeMeta = {
    summary: {
        title: 'Use a saved summary prompt',
        description: 'Choose a saved summary prompt and apply it to the current live session.',
        icon: FileText,
        badgeTone: 'primary'
    },
    checkbox: {
        title: 'Use a saved checklist prompt',
        description: 'Choose a saved checklist prompt and apply it to the current live session.',
        icon: CheckSquare,
        badgeTone: 'success'
    }
};

function formatDate(value) {
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
}

export function PromptSelectorModal({
    isOpen,
    onClose,
    mode,
    prompts = [],
    isLoading = false,
    error = null,
    onRefresh,
    onUsePrompt,
    applyingPromptId = null
}) {
    const [search, setSearch] = useState('');
    const meta = modeMeta[mode] || modeMeta.summary;
    const Icon = meta.icon;

    useEffect(() => {
        if (isOpen) {
            setSearch('');
        }
    }, [isOpen]);

    const filteredPrompts = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        return prompts
            .filter((prompt) => prompt.mode === mode)
            .filter((prompt) => {
                if (!normalizedSearch) return true;
                return [
                    prompt.title,
                    prompt.description,
                    prompt.authorName,
                    prompt.content,
                    ...(Array.isArray(prompt.tags) ? prompt.tags : [])
                ]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(normalizedSearch));
            });
    }, [mode, prompts, search]);

    const totalModePrompts = useMemo(
        () => prompts.filter((prompt) => prompt.mode === mode).length,
        [mode, prompts]
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent size="xl">
                <DialogHeader>
                    <DialogTitle>{meta.title}</DialogTitle>
                    <DialogDescription>{meta.description} Edit prompts from the Prompts page when needed.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <Panel padding="md" tone="subtle" className="space-y-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                            <Field
                                label="Search saved prompts"
                                hint={`Filter by title, description, author, or ${mode === 'checkbox' ? 'criteria' : 'prompt content'}.`}
                                className="flex-1"
                            >
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                                    <Input
                                        type="text"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder={mode === 'checkbox' ? 'Search by topic, class, or criteria' : 'Search by topic, class, or prompt goal'}
                                        className="bg-[var(--surface)] pl-10 pr-10"
                                    />
                                    {search ? (
                                        <button
                                            type="button"
                                            onClick={() => setSearch('')}
                                            className="absolute right-3 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                                            aria-label="Clear search"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    ) : null}
                                </div>
                            </Field>

                            <Button type="button" variant="secondary" size="sm" onClick={onRefresh} disabled={isLoading} className="lg:mb-[1.42rem]">
                                <RefreshCw className="h-4 w-4" />
                                Refresh
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs copy-muted">
                            <span>
                                {filteredPrompts.length} {mode} prompt{filteredPrompts.length === 1 ? '' : 's'}
                                {search ? ' match your search' : ' available'}
                            </span>
                            <span>{totalModePrompts} saved total</span>
                        </div>
                    </Panel>

                    {error ? (
                        <Alert tone="danger" title="Unable to load saved prompts">
                            <p>{error}</p>
                        </Alert>
                    ) : null}

                    {isLoading && prompts.length === 0 ? (
                        <Panel padding="lg" className="flex h-48 items-center justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--surface-muted)] border-t-[var(--primary)]" />
                                <p className="text-sm">Loading saved prompts…</p>
                            </div>
                        </Panel>
                    ) : filteredPrompts.length === 0 ? (
                        <EmptyState
                            icon={Icon}
                            title={`No ${mode} prompts found`}
                            description={search
                                ? 'Try a different search term or refresh the library.'
                                : `Create a ${mode} prompt in the Prompts page, then return here to use it.`}
                        />
                    ) : (
                        <div className="space-y-4">
                            {filteredPrompts.map((prompt) => {
                                const checkboxPreview = mode === 'checkbox'
                                    ? parseCheckboxPromptContent(prompt.content, prompt.scenario || '')
                                    : null;
                                const previewText = mode === 'checkbox'
                                    ? checkboxPreview.criteriaText || 'No checklist criteria found.'
                                    : getSummaryPromptPreview(prompt.content, 180);
                                const isApplying = applyingPromptId === prompt._id;

                                return (
                                    <Panel key={prompt._id} padding="lg" className="flex h-full flex-col gap-4">
                                        <div className="space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="truncate text-lg font-semibold text-[var(--text)]" title={prompt.title}>
                                                        {prompt.title}
                                                    </h3>
                                                    <p className="mt-1 text-sm">
                                                        {prompt.description || 'No description provided.'}
                                                    </p>
                                                </div>
                                                <Badge tone={meta.badgeTone} size="sm" icon={Icon}>
                                                    {mode === 'checkbox' ? 'Checklist' : 'Summary'}
                                                </Badge>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 text-xs copy-muted">
                                                <span>{prompt.authorName || 'Anonymous Teacher'}</span>
                                                <span>•</span>
                                                <span>{formatDate(prompt.created_at)}</span>
                                                {mode === 'checkbox' ? (
                                                    <>
                                                        <span>•</span>
                                                        <span>{checkboxPreview.criteria.length} criteria</span>
                                                    </>
                                                ) : null}
                                            </div>

                                            {mode === 'checkbox' && checkboxPreview?.scenario ? (
                                                <div className="ui-panel ui-panel--subtle ui-panel--pad-sm text-sm">
                                                    <span className="copy-strong">Scenario:</span> {checkboxPreview.scenario}
                                                </div>
                                            ) : null}

                                            <div className="ui-code-block max-h-40 overflow-y-auto overflow-x-hidden pr-2 text-sm whitespace-pre-wrap">
                                                {previewText}
                                            </div>
                                        </div>

                                        <div className="mt-auto flex justify-end">
                                            <Button
                                                type="button"
                                                variant="primary"
                                                size="sm"
                                                onClick={() => onUsePrompt(prompt)}
                                                disabled={Boolean(applyingPromptId)}
                                            >
                                                <Play className="h-4 w-4" />
                                                {isApplying ? 'Applying…' : 'Use in session'}
                                            </Button>
                                        </div>
                                    </Panel>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
