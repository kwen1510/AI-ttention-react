import React, { useId, useState } from 'react';
import { ChevronDown, Info, HelpCircle, Trash2, Save, ClipboardList, Library, Send } from 'lucide-react';
import { Alert } from '../../../components/ui/alert.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { Field, Textarea, Input } from '../../../components/ui/field.jsx';
import { Panel, PanelHeader } from '../../../components/ui/panel.jsx';

export function CriteriaManager({
    scenario,
    onScenarioChange,
    criteriaText,
    onCriteriaChange,
    strictness,
    onStrictnessChange,
    onSave,
    onClear,
    onReleaseAll,
    canReleaseAll = false,
    releaseAllLabel = 'Release all checklists',
    feedback,
    isLoading,
    onOpenLibrary,
    isLibraryLoading
}) {
    const [isOpen, setIsOpen] = useState(true);
    const [showFormatHelp, setShowFormatHelp] = useState(false);
    const contentId = useId();
    const strictnessLabel = strictness === 1 ? 'Lenient' : strictness === 2 ? 'Moderate' : 'Strict';

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
                        icon={ClipboardList}
                        title="Checklist criteria"
                        description="Define the scenario and the criteria the assistant should track."
                    />
                    <ChevronDown className={`h-5 w-5 text-[var(--text-muted)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {isOpen && (
                <div id={contentId} className="border-t border-[var(--border)] p-6">
                    <div className="space-y-6">
                        <div className="cluster">
                            <Button type="button" onClick={onOpenLibrary} variant="secondary" size="sm" disabled={!onOpenLibrary || isLibraryLoading}>
                                <Library className="h-3.5 w-3.5" />
                                {isLibraryLoading ? 'Loading prompts…' : 'Saved prompts'}
                            </Button>
                        </div>

                        <Field label="Discussion question or scenario">
                            <Textarea
                                value={scenario}
                                onChange={(e) => onScenarioChange(e.target.value)}
                                rows={4}
                                placeholder="Enter the discussion question or scenario context..."
                            />
                        </Field>

                        <Field
                            label="Criteria checklist"
                            hint="Write one criterion per line. Use Description (Rubric) when you want to include guidance."
                        >
                            {showFormatHelp && (
                                <Alert className="mb-3" tone="primary" icon={Info} title="Format guide">
                                    <p className="mb-2">Use the format <code>Description (Rubric)</code>.</p>
                                    <p className="text-xs">
                                        Example: <span className="copy-strong">Students explain back titration</span> (<span className="copy-strong">CaCO3 is not soluble</span>)
                                    </p>
                                </Alert>
                            )}

                            <Textarea
                                value={criteriaText}
                                onChange={(e) => onCriteriaChange(e.target.value)}
                                rows={8}
                                className="font-mono text-sm"
                                placeholder="Enter criteria..."
                            />

                            <div className="mt-2 flex items-center justify-between gap-3">
                                <span className="text-xs copy-muted">Use plain lines or add rubric details in parentheses.</span>
                                <Button type="button" onClick={() => setShowFormatHelp(!showFormatHelp)} variant="ghost" size="sm">
                                    <HelpCircle className="h-3.5 w-3.5" />
                                    Format Help
                                </Button>
                            </div>
                        </Field>

                        <Field label="Evaluation strictness">
                            <div className="ui-panel ui-panel--subtle ui-panel--pad-md">
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="text-xs copy-muted font-medium">Lenient</span>
                                    <span className="text-sm font-semibold text-[var(--text)]">
                                        {strictnessLabel}
                                    </span>
                                    <span className="text-xs copy-muted font-medium">Strict</span>
                                </div>
                                <Input
                                    type="range"
                                    min={1}
                                    max={3}
                                    value={strictness}
                                    onChange={(e) => onStrictnessChange(Number(e.target.value))}
                                    aria-label="Evaluation strictness"
                                    aria-valuetext={strictnessLabel}
                                    className="p-0"
                                />
                            </div>
                        </Field>

                        <div className="flex flex-col-reverse gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <Button type="button" onClick={onClear} disabled={isLoading} variant="ghost" size="sm" className="w-full sm:w-auto">
                                <Trash2 className="h-4 w-4" />
                                Clear All
                            </Button>
                            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                                <Button
                                    type="button"
                                    onClick={onReleaseAll}
                                    disabled={isLoading || !canReleaseAll}
                                    variant="secondary"
                                    className="w-full sm:w-auto"
                                >
                                    <Send className="h-4 w-4" />
                                    {releaseAllLabel}
                                </Button>
                                <Button type="button" onClick={onSave} disabled={isLoading} variant="primary" className="w-full sm:w-auto">
                                    <Save className="h-4 w-4" />
                                    {isLoading ? 'Saving…' : 'Save & Apply'}
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
