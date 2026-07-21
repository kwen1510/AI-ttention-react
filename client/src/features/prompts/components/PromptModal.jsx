import React, { useEffect, useMemo, useState } from 'react';
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

const EMPTY_PROMPT = {
    title: '',
    description: '',
    content: '',
    category: 'General',
    mode: 'summary',
    tags: '',
    isPublic: true,
};

export function PromptModal({ isOpen, onClose, onSave, initialData = null, categories = [] }) {
    const [formData, setFormData] = useState(EMPTY_PROMPT);
    const [validationError, setValidationError] = useState('');

    useEffect(() => {
        setFormData(initialData ? {
            ...EMPTY_PROMPT,
            ...initialData,
            tags: Array.isArray(initialData.tags) ? initialData.tags.join(', ') : '',
        } : EMPTY_PROMPT);
        setValidationError('');
    }, [initialData, isOpen]);

    const categorySuggestions = useMemo(
        () => [...new Set(['General', ...categories].map((value) => String(value || '').trim()).filter(Boolean))],
        [categories]
    );

    const handleChange = (event) => {
        const { name, value, type, checked } = event.target;
        setFormData((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        if (formData.mode === 'checkbox') {
            const lines = formData.content.split('\n').map((line) => line.trim()).filter(Boolean);
            if (lines.length < 2 || !/^scenario\s*:/i.test(lines[0])) {
                setValidationError('Checkbox prompts need a “Scenario:” first line and at least one criterion.');
                return;
            }
        }

        setValidationError('');
        onSave({
            ...formData,
            tags: formData.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit prompt' : 'Create prompt'}</DialogTitle>
                    <DialogDescription>Save a reusable Summary or Checklist instruction.</DialogDescription>
                </DialogHeader>

                <form id="promptForm" onSubmit={handleSubmit} className="space-y-4">
                    <Field label="Title" htmlFor="title">
                        <Input
                            id="title"
                            name="title"
                            required
                            value={formData.title}
                            onChange={handleChange}
                            placeholder="e.g., Physics lab discussion"
                        />
                    </Field>

                    <Field label="Description" htmlFor="description" hint="Optional">
                        <Textarea
                            id="description"
                            name="description"
                            rows="2"
                            value={formData.description}
                            onChange={handleChange}
                        />
                    </Field>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Category" htmlFor="category">
                            <Input
                                id="category"
                                name="category"
                                list="prompt-categories"
                                value={formData.category}
                                onChange={handleChange}
                            />
                            <datalist id="prompt-categories">
                                {categorySuggestions.map((category) => <option key={category} value={category} />)}
                            </datalist>
                        </Field>
                        <Field label="Mode" htmlFor="mode">
                            <Select id="mode" name="mode" value={formData.mode} onChange={handleChange}>
                                <option value="summary">Summary</option>
                                <option value="checkbox">Checklist</option>
                            </Select>
                        </Field>
                    </div>

                    <Field
                        label={formData.mode === 'checkbox' ? 'Scenario and criteria' : 'Prompt content'}
                        htmlFor="content"
                        hint={formData.mode === 'checkbox' ? 'First line: Scenario: …; one criterion per following line.' : ''}
                    >
                        <Textarea
                            id="content"
                            name="content"
                            rows="8"
                            required
                            value={formData.content}
                            onChange={handleChange}
                            className="font-mono text-sm"
                            placeholder={formData.mode === 'checkbox'
                                ? 'Scenario: Students discuss…\nUses evidence (quotes a source)'
                                : 'Summarise the discussion in concise bullet points.'}
                        />
                    </Field>

                    {validationError ? <Alert tone="danger"><p>{validationError}</p></Alert> : null}

                    <Field label="Tags" htmlFor="tags" hint="Optional, comma-separated">
                        <Input id="tags" name="tags" value={formData.tags} onChange={handleChange} />
                    </Field>

                    <label className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
                        <input
                            type="checkbox"
                            name="isPublic"
                            checked={formData.isPublic}
                            onChange={handleChange}
                            className="ui-checkbox"
                        />
                        <span className="text-sm text-[var(--text)]">
                            Global prompt. Turn off to keep it visible only to you.
                        </span>
                    </label>
                </form>

                <DialogFooter>
                    <Button type="button" onClick={onClose} variant="secondary">Cancel</Button>
                    <Button type="submit" form="promptForm" variant="primary">
                        {initialData ? 'Update prompt' : 'Save prompt'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
