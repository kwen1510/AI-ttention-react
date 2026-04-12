import React, { useId, useState } from 'react';
import { FileText, ChevronDown, FlaskConical, Check } from 'lucide-react';
import { Alert } from '../../../components/ui/alert.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { Panel, PanelHeader } from '../../../components/ui/panel.jsx';
import { Textarea } from '../../../components/ui/field.jsx';
import {
    DEFAULT_SUMMARY_PROMPT,
    getSummaryPromptPreview,
    isDefaultSummaryPrompt,
} from '../../../lib/prompts.js';

export function PromptManager({
    currentPrompt,
    onPromptChange,
    onSave,
    onTest,
    onReset,
    library,
    onLoadFromLibrary,
    feedback
}) {
    const [isOpen, setIsOpen] = useState(false);
    const contentId = useId();
    const activePrompt = String(currentPrompt || '').trim() || DEFAULT_SUMMARY_PROMPT;
    const usingDefaultPrompt = isDefaultSummaryPrompt(activePrompt);
    const promptPreview = getSummaryPromptPreview(activePrompt);

    return (
        <Panel padding="none">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-controls={contentId}
                className="w-full p-6 text-left"
            >
                <div className="flex items-center justify-between gap-3">
                    <PanelHeader
                        className="w-full border-b-0 p-0"
                        icon={FileText}
                        title="Summary prompt"
                        description="Adjust the live summarization instruction without changing session behavior."
                    />
                    <ChevronDown className={`h-5 w-5 text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>

                {!isOpen ? (
                    <div className="ml-[3.375rem] mt-4 space-y-2">
                        <span className="ui-badge ui-badge--sm ui-badge--neutral">
                            {usingDefaultPrompt ? 'Default prompt' : 'Session prompt'}
                        </span>
                        <p className="line-clamp-2 text-sm copy-muted">{promptPreview}</p>
                    </div>
                ) : null}
            </button>

            {isOpen && (
                <div id={contentId} className="border-t border-[var(--border)] p-6">
                    <div className="space-y-4">
                        <Textarea
                            value={currentPrompt}
                            onChange={(e) => onPromptChange(e.target.value)}
                            rows={4}
                            className="font-mono text-sm"
                            placeholder="Enter your custom prompt..."
                        />

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="cluster">
                                <Button type="button" onClick={() => onTest(currentPrompt)} variant="secondary" size="sm">
                                    <FlaskConical className="h-3.5 w-3.5" />
                                    Test
                                </Button>
                                <Button type="button" onClick={() => onSave(currentPrompt)} variant="primary" size="sm">
                                    <Check className="h-3.5 w-3.5" />
                                    Apply
                                </Button>
                                <Button type="button" onClick={onReset} variant="ghost" size="sm">
                                    Reset Default
                                </Button>
                            </div>
                        </div>

                        {feedback && (
                            <Alert tone={feedback.type === 'error' ? 'danger' : feedback.type === 'success' ? 'success' : 'primary'}>
                                <p>{feedback.message}</p>
                            </Alert>
                        )}
                    </div>
                </div>
            )}
        </Panel>
    );
}
