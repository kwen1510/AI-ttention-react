import React, { useState, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
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

export function PromptModal({ isOpen, onClose, onSave, initialData = null, categories = [] }) {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        content: '',
        category: 'General',
        mode: 'summary',
        tags: '',
        isPublic: true,
        authorName: ''
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                tags: initialData.tags ? initialData.tags.join(', ') : ''
            });
        } else {
            setFormData({
                title: '',
                description: '',
                content: '',
                category: 'General',
                mode: 'summary',
                tags: '',
                isPublic: true,
                authorName: ''
            });
        }
    }, [initialData, isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();

        // Validation for checkbox mode
        if (formData.mode === 'checkbox') {
            const lines = formData.content.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2 || !/^scenario\s*:/i.test(lines[0])) {
                alert('For Checkbox mode, the first line must start with "Scenario:" followed by at least one criterion line.');
                return;
            }
        }

        onSave({
            ...formData,
            tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean)
        });
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent size="lg">
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
                        <Field label="Category" htmlFor="category">
                            <Select
                                name="category"
                                id="category"
                                value={formData.category}
                                onChange={handleChange}
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                                {!categories.includes(formData.category) && (
                                    <option value={formData.category}>{formData.category}</option>
                                )}
                            </Select>
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
