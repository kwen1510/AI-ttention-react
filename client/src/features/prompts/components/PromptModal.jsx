import React, { useEffect, useMemo, useState } from 'react';
import { FlaskConical, HelpCircle, History, RefreshCw } from 'lucide-react';
import { Alert } from '../../../components/ui/alert.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { Field, Input, Select, Textarea } from '../../../components/ui/field.jsx';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog.jsx';
import { parseCheckboxPromptContent } from '../../../lib/prompts.js';
import {
    getChecklistItemClassName,
    getChecklistStatusClassName,
    getChecklistStatusLabel,
    normalizeChecklistStatus,
} from '../../../lib/statusTone.js';

function createEmptyFormState() {
    return {
        title: '',
        description: '',
        content: '',
        category: 'General',
        mode: 'summary',
        tags: '',
        isPublic: true,
        authorName: ''
    };
}

function formatHistorySessionLabel(session) {
    if (!session) return 'Unknown session';
    const dateValue = session.updated_at || session.created_at;
    const dateLabel = dateValue
        ? new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }).format(new Date(dateValue))
        : 'Unknown date';

    return `${session.code} · ${dateLabel}`;
}

function buildCheckboxCriteriaPreview(text = '') {
    return parseCheckboxPromptContent(text).criteria.map((line, index) => {
        const match = String(line || '').trim().match(/^(.+?)\s*\((.+)\)\s*$/);
        if (match) {
            return {
                id: index,
                description: match[1].trim(),
                rubric: match[2].trim()
            };
        }

        return {
            id: index,
            description: String(line || '').trim(),
            rubric: 'No specific rubric provided'
        };
    }).filter((criterion) => criterion.description);
}

export function PromptModal({ isOpen, onClose, onSave, initialData = null, categories = [] }) {
    const [formData, setFormData] = useState(createEmptyFormState());
    const [testSource, setTestSource] = useState('custom');
    const [testTranscript, setTestTranscript] = useState('');
    const [testResult, setTestResult] = useState(null);
    const [testError, setTestError] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [historySessions, setHistorySessions] = useState([]);
    const [historyGroups, setHistoryGroups] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [selectedSessionCode, setSelectedSessionCode] = useState('');
    const [selectedGroupNumber, setSelectedGroupNumber] = useState('');

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...createEmptyFormState(),
                ...initialData,
                tags: initialData.tags ? initialData.tags.join(', ') : ''
            });
        } else {
            setFormData(createEmptyFormState());
        }

        setTestSource('custom');
        setTestTranscript('');
        setTestResult(null);
        setTestError('');
        setHistorySessions([]);
        setHistoryGroups([]);
        setHistoryError('');
        setSelectedSessionCode('');
        setSelectedGroupNumber('');
    }, [initialData, isOpen]);

    useEffect(() => {
        setTestResult(null);
        setTestError('');
    }, [formData.content, formData.mode, testTranscript]);

    useEffect(() => {
        setHistorySessions([]);
        setHistoryGroups([]);
        setHistoryError('');
        setSelectedSessionCode('');
        setSelectedGroupNumber('');
        if (testSource === 'history') {
            setTestTranscript('');
        }
    }, [formData.mode, testSource]);

    const categorySuggestions = useMemo(() => {
        return ['General', ...categories]
            .map((category) => String(category || '').trim())
            .filter(Boolean)
            .filter((category, index, values) => values.indexOf(category) === index);
    }, [categories]);

    const checkboxCriteriaPreview = useMemo(
        () => formData.mode === 'checkbox' ? buildCheckboxCriteriaPreview(formData.content) : [],
        [formData.content, formData.mode]
    );

    const checkboxMatchesByIndex = useMemo(() => {
        const matches = Array.isArray(testResult?.matches) ? testResult.matches : [];
        return new Map(matches.map((match) => [Number(match.criteria_index), match]));
    }, [testResult]);

    const canRunTest = formData.content.trim().length > 0 && testTranscript.trim().length > 0;

    const handleSubmit = (e) => {
        e.preventDefault();

        if (formData.mode === 'checkbox') {
            const lines = formData.content.split('\n').map((line) => line.trim()).filter(Boolean);
            if (lines.length < 2 || !/^scenario\s*:/i.test(lines[0])) {
                alert('For Checkbox mode, the first line must start with "Scenario:" followed by at least one criterion line.');
                return;
            }
        }

        onSave({
            ...formData,
            tags: formData.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
        });
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const loadHistorySessions = async () => {
        try {
            setHistoryLoading(true);
            setHistoryError('');
            const response = await fetch(`/api/history/sessions?limit=20&mode=${formData.mode}`);
            if (!response.ok) {
                throw new Error(`Failed to load history (${response.status})`);
            }

            const data = await response.json();
            setHistorySessions(Array.isArray(data.sessions) ? data.sessions : []);
        } catch (err) {
            console.error('Failed to load history sessions:', err);
            setHistoryError(err.message || 'Failed to load history sessions');
            setHistorySessions([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const loadHistorySessionDetail = async (sessionCode) => {
        try {
            setHistoryLoading(true);
            setHistoryError('');
            const response = await fetch(`/api/history/sessions/${sessionCode}`);
            if (!response.ok) {
                throw new Error(`Failed to load transcript (${response.status})`);
            }

            const data = await response.json();
            const groups = Array.isArray(data.groups) ? data.groups : [];
            setHistoryGroups(groups);

            if (groups.length > 0) {
                const firstGroup = groups[0];
                setSelectedGroupNumber(String(firstGroup.groupNumber));
                setTestTranscript(String(firstGroup.fullTranscript || ''));
            } else {
                setSelectedGroupNumber('');
                setTestTranscript('');
            }
        } catch (err) {
            console.error('Failed to load history session detail:', err);
            setHistoryError(err.message || 'Failed to load transcript');
            setHistoryGroups([]);
            setSelectedGroupNumber('');
            setTestTranscript('');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleSelectHistorySession = async (event) => {
        const nextCode = event.target.value;
        setSelectedSessionCode(nextCode);
        setHistoryGroups([]);
        setSelectedGroupNumber('');
        setTestTranscript('');

        if (!nextCode) {
            return;
        }

        await loadHistorySessionDetail(nextCode);
    };

    const handleSelectHistoryGroup = (event) => {
        const nextGroupNumber = event.target.value;
        setSelectedGroupNumber(nextGroupNumber);
        const selectedGroup = historyGroups.find((group) => String(group.groupNumber) === String(nextGroupNumber));
        setTestTranscript(String(selectedGroup?.fullTranscript || ''));
    };

    const handleRunTest = async () => {
        if (!canRunTest) {
            return;
        }

        try {
            setIsTesting(true);
            setTestError('');
            setTestResult(null);

            const response = await fetch('/api/test-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: formData.mode,
                    promptContent: formData.content,
                    transcript: testTranscript
                })
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || 'Prompt test failed');
            }

            setTestResult(payload);
        } catch (err) {
            console.error('Prompt test failed:', err);
            setTestError(err.message || 'Prompt test failed');
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent size="xl">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit prompt' : 'Create prompt'}</DialogTitle>
                    <DialogDescription>
                        Save reusable prompt presets for summary or checklist sessions.
                    </DialogDescription>
                </DialogHeader>

                <form id="promptForm" onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Title" htmlFor="title">
                            <Input
                                type="text"
                                name="title"
                                id="title"
                                required
                                value={formData.title}
                                onChange={handleChange}
                                placeholder="e.g., Physics Lab Discussion"
                            />
                        </Field>
                        <Field label="Author name" htmlFor="authorName">
                            <Input
                                type="text"
                                name="authorName"
                                id="authorName"
                                value={formData.authorName}
                                onChange={handleChange}
                                placeholder="Your name"
                            />
                        </Field>
                    </div>

                    <Field label="Description" htmlFor="description">
                        <Textarea
                            name="description"
                            id="description"
                            rows="2"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Brief description of what this prompt does..."
                        />
                    </Field>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field
                            label="Category"
                            htmlFor="category"
                            hint="Choose an existing category or type a new one."
                        >
                            <Input
                                name="category"
                                id="category"
                                value={formData.category}
                                onChange={handleChange}
                                list="prompt-category-suggestions"
                                placeholder="e.g., Assessment"
                            />
                            <datalist id="prompt-category-suggestions">
                                {categorySuggestions.map((category) => (
                                    <option key={category} value={category} />
                                ))}
                            </datalist>
                        </Field>
                        <Field label="Mode" htmlFor="mode">
                            <Select
                                name="mode"
                                id="mode"
                                value={formData.mode}
                                onChange={handleChange}
                            >
                                <option value="summary">Summary</option>
                                <option value="checkbox">Checkbox</option>
                            </Select>
                        </Field>
                    </div>

                    <Field
                        label={formData.mode === 'checkbox' ? 'Scenario & criteria' : 'Prompt content'}
                        htmlFor="content"
                        hint={formData.mode === 'checkbox' ? 'First line must start with "Scenario:". Each following line is treated as a criterion.' : ''}
                    >
                        <Textarea
                            name="content"
                            id="content"
                            rows="8"
                            required
                            value={formData.content}
                            onChange={handleChange}
                            className="font-mono text-sm"
                            placeholder={formData.mode === 'checkbox'
                                ? "Scenario: Students are discussing Newton's laws...\nCriterion 1 (optional rubric)\nCriterion 2 (optional rubric)\n..."
                                : "Enter your AI prompt here..."}
                        />
                    </Field>

                    {formData.mode === 'checkbox' ? (
                        <Alert tone="primary" icon={HelpCircle}>
                            <p>The first line should start with <code>Scenario:</code>. Each following line becomes a checklist criterion.</p>
                        </Alert>
                    ) : null}

                    <div className="ui-panel ui-panel--subtle ui-panel--pad-md space-y-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h3 className="ui-panel-title">Test this prompt</h3>
                                <p className="ui-panel-description">
                                    Try the prompt against a pasted transcript or pull one from History before saving.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={handleRunTest}
                                disabled={!canRunTest || isTesting}
                            >
                                <FlaskConical className="h-4 w-4" />
                                {isTesting ? 'Testing…' : 'Run test'}
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Field label="Transcript source" htmlFor="testSource">
                                <Select
                                    id="testSource"
                                    value={testSource}
                                    onChange={(event) => setTestSource(event.target.value)}
                                >
                                    <option value="custom">Paste my own transcript</option>
                                    <option value="history">Use a transcript from History</option>
                                </Select>
                            </Field>

                            {testSource === 'history' ? (
                                <Field label="History transcripts" htmlFor="historySession">
                                    <div className="flex gap-2">
                                        <Select
                                            id="historySession"
                                            value={selectedSessionCode}
                                            onChange={handleSelectHistorySession}
                                            className="flex-1"
                                        >
                                            <option value="">Select a past session</option>
                                            {historySessions.map((session) => (
                                                <option key={session._id} value={session.code}>
                                                    {formatHistorySessionLabel(session)}
                                                </option>
                                            ))}
                                        </Select>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={loadHistorySessions}
                                            disabled={historyLoading}
                                        >
                                            {historyLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                                            Load
                                        </Button>
                                    </div>
                                </Field>
                            ) : null}
                        </div>

                        {testSource === 'history' ? (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <Field label="Group" htmlFor="historyGroup" hint="Choose which group transcript to test against.">
                                    <Select
                                        id="historyGroup"
                                        value={selectedGroupNumber}
                                        onChange={handleSelectHistoryGroup}
                                        disabled={historyGroups.length === 0}
                                    >
                                        <option value="">Select a group</option>
                                        {historyGroups.map((group) => (
                                            <option key={group._id} value={group.groupNumber}>
                                                Group {group.groupNumber}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <div className="flex items-end">
                                    <p className="text-sm copy-muted">
                                        Loaded transcripts can still be edited below before you run the test.
                                    </p>
                                </div>
                            </div>
                        ) : null}

                        {historyError ? (
                            <Alert tone="danger">
                                <p>{historyError}</p>
                            </Alert>
                        ) : null}

                        <Field
                            label="Transcript to test against"
                            htmlFor="testTranscript"
                            hint={testSource === 'history'
                                ? 'The selected transcript is editable, so you can trim or replace it before testing.'
                                : 'Paste a conversation transcript here to see how this prompt behaves.'}
                        >
                            <Textarea
                                id="testTranscript"
                                rows="8"
                                value={testTranscript}
                                onChange={(event) => setTestTranscript(event.target.value)}
                                placeholder={testSource === 'history'
                                    ? 'Select a session and group from History to load a transcript here.'
                                    : 'Paste a transcript here to test the prompt...'}
                            />
                        </Field>

                        {testError ? (
                            <Alert tone="danger" title="Prompt test failed">
                                <p>{testError}</p>
                            </Alert>
                        ) : null}

                        {testResult ? (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-[var(--text)]">Test result</h4>
                                {testResult.mode === 'summary' ? (
                                    <div className="ui-code-block text-sm whitespace-pre-wrap">
                                        {testResult.summary || 'No summary returned.'}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {checkboxCriteriaPreview.map((criterion, index) => {
                                            const match = checkboxMatchesByIndex.get(index) || { status: 'grey', quote: null, why: null };
                                            const normalizedStatus = normalizeChecklistStatus(match.status);
                                            return (
                                                <div key={`${criterion.description}-${index}`} className={getChecklistItemClassName(normalizedStatus)}>
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-[var(--text)]">{criterion.description}</p>
                                                            <p className="mt-1 text-xs copy-muted">Rubric: {criterion.rubric}</p>
                                                        </div>
                                                        <span className={getChecklistStatusClassName(normalizedStatus)}>
                                                            {getChecklistStatusLabel(normalizedStatus)}
                                                        </span>
                                                    </div>
                                                    {match.quote ? (
                                                        <div className="checklist-item__quote mt-3 text-xs text-[var(--text)]">
                                                            "{match.quote}"
                                                        </div>
                                                    ) : null}
                                                    {match.why ? (
                                                        <p className="mt-2 text-xs copy-muted">{match.why}</p>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>

                    <Field label="Tags" htmlFor="tags" hint="Separate tags with commas.">
                        <Input
                            type="text"
                            name="tags"
                            id="tags"
                            value={formData.tags}
                            onChange={handleChange}
                            placeholder="science, physics, grade-10"
                        />
                    </Field>

                    <label className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
                        <input
                            type="checkbox"
                            name="isPublic"
                            id="isPublic"
                            checked={formData.isPublic}
                            onChange={handleChange}
                            className="ui-checkbox"
                        />
                        <span className="text-sm text-[var(--text)]">
                            Make this prompt public so other teachers can use it.
                        </span>
                    </label>
                </form>

                <DialogFooter>
                    <Button type="button" onClick={onClose} variant="secondary">
                        Cancel
                    </Button>
                    <Button type="submit" form="promptForm" variant="primary">
                        {initialData ? 'Update prompt' : 'Save prompt'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
