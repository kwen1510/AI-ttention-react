import React, { useState, useEffect } from 'react';
import { X, HelpCircle } from 'lucide-react';

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

    if (!isOpen) return null;

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
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full">
                    <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="flex justify-between items-start mb-5">
                            <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                {initialData ? 'Edit Prompt' : 'Create New Prompt'}
                            </h3>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <form id="promptForm" onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                                    <input
                                        type="text"
                                        name="title"
                                        id="title"
                                        required
                                        value={formData.title}
                                        onChange={handleChange}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                        placeholder="e.g., Physics Lab Discussion"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="authorName" className="block text-sm font-medium text-gray-700 mb-1">Author Name</label>
                                    <input
                                        type="text"
                                        name="authorName"
                                        id="authorName"
                                        value={formData.authorName}
                                        onChange={handleChange}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                        placeholder="Your Name"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    name="description"
                                    id="description"
                                    rows="2"
                                    value={formData.description}
                                    onChange={handleChange}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                    placeholder="Brief description of what this prompt does..."
                                ></textarea>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                    <select
                                        name="category"
                                        id="category"
                                        value={formData.category}
                                        onChange={handleChange}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                    >
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                        {!categories.includes(formData.category) && (
                                            <option value={formData.category}>{formData.category}</option>
                                        )}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="mode" className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
                                    <select
                                        name="mode"
                                        id="mode"
                                        value={formData.mode}
                                        onChange={handleChange}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                    >
                                        <option value="summary">Summary</option>
                                        <option value="checkbox">Checkbox</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
                                    {formData.mode === 'checkbox' ? 'Scenario & Criteria' : 'Prompt Content'}
                                </label>
                                <textarea
                                    name="content"
                                    id="content"
                                    rows="8"
                                    required
                                    value={formData.content}
                                    onChange={handleChange}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 font-mono"
                                    placeholder={formData.mode === 'checkbox'
                                        ? "Scenario: Students are discussing Newton's laws...\nCriterion 1 (optional rubric)\nCriterion 2 (optional rubric)\n..."
                                        : "Enter your AI prompt here..."}
                                ></textarea>
                                {formData.mode === 'checkbox' && (
                                    <p className="mt-1 text-xs text-gray-500 flex items-center">
                                        <HelpCircle className="w-3 h-3 mr-1" />
                                        First line must be "Scenario: ...". Subsequent lines are criteria.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                                <input
                                    type="text"
                                    name="tags"
                                    id="tags"
                                    value={formData.tags}
                                    onChange={handleChange}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                    placeholder="science, physics, grade-10 (comma separated)"
                                />
                            </div>

                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    name="isPublic"
                                    id="isPublic"
                                    checked={formData.isPublic}
                                    onChange={handleChange}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-900">
                                    Make this prompt public (visible to all teachers)
                                </label>
                            </div>
                        </form>
                    </div>
                    <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <button
                            type="button"
                            onClick={handleSubmit}
                            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                        >
                            {initialData ? 'Update Prompt' : 'Save Prompt'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
