import React from 'react';
import { Edit, Copy, Trash2, Play, Globe, Lock, FileText, CheckSquare } from 'lucide-react';
import { Badge } from '../../../components/ui/badge.jsx';
import { Button } from '../../../components/ui/button.jsx';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog.jsx';

export function PromptViewModal({
    prompt,
    isOpen,
    onClose,
    onUse,
    onEdit,
    onClone,
    onDelete
}) {
    if (!prompt) return null;

    const modeTones = {
        summary: 'primary',
        checkbox: 'success'
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>{prompt.title}</DialogTitle>
                    <DialogDescription>
                        Created by {prompt.createdByEmail || prompt.authorName || 'Anonymous Teacher'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    <section>
                        <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">Description</h4>
                        <p>{prompt.description || 'No description provided.'}</p>
                    </section>

                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div className="ui-metric">
                            <span className="ui-metric__label">Category</span>
                            <Badge tone="neutral">{prompt.category}</Badge>
                        </div>
                        <div className="ui-metric">
                            <span className="ui-metric__label">Mode</span>
                            <Badge tone={modeTones[prompt.mode]} icon={prompt.mode === 'checkbox' ? CheckSquare : FileText}>
                                {prompt.mode.charAt(0).toUpperCase() + prompt.mode.slice(1)}
                            </Badge>
                        </div>
                        <div className="ui-metric">
                            <span className="ui-metric__label">Views</span>
                            <span className="ui-metric__value">{prompt.views || 0}</span>
                        </div>
                        <div className="ui-metric">
                            <span className="ui-metric__label">Uses</span>
                            <span className="ui-metric__value">{prompt.usage_count || 0}</span>
                        </div>
                    </div>

                    {prompt.tags && prompt.tags.length > 0 && (
                        <section>
                            <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">Tags</h4>
                            <div className="flex flex-wrap gap-2">
                                {prompt.tags.map((tag, idx) => (
                                    <Badge key={idx} tone="accent">{tag}</Badge>
                                ))}
                            </div>
                        </section>
                    )}

                    <section>
                        <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">Prompt content</h4>
                        <pre className="ui-code-block text-sm">{prompt.content}</pre>
                    </section>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm copy-muted">
                        <span>Created: {new Date(prompt.created_at).toLocaleString()}</span>
                        {prompt.isPublic ? (
                            <Badge tone="success" icon={Globe}>Public</Badge>
                        ) : (
                            <Badge tone="neutral" icon={Lock}>Private</Badge>
                        )}
                    </div>
                </div>

                <DialogFooter className="justify-between">
                    <div className="cluster">
                        {prompt.canEdit ? (
                            <Button type="button" onClick={() => onEdit(prompt)} variant="secondary" size="sm">
                                <Edit className="h-4 w-4" /> Edit
                            </Button>
                        ) : null}
                        {prompt.canClone !== false ? (
                            <Button type="button" onClick={() => onClone(prompt)} variant="secondary" size="sm">
                                <Copy className="h-4 w-4" /> Clone
                            </Button>
                        ) : null}
                        {prompt.canDelete ? (
                            <Button type="button" onClick={() => onDelete(prompt._id)} variant="danger" size="sm">
                                <Trash2 className="h-4 w-4" /> Delete
                            </Button>
                        ) : null}
                    </div>

                    <Button type="button" onClick={() => onUse(prompt._id)} variant="primary">
                        <Play className="h-4 w-4" /> Use Prompt
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
