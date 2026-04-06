import React from 'react';
import { X, Edit, Copy, Trash2, Play, Globe, Lock, FileText, CheckSquare } from 'lucide-react';

export function PromptViewModal({
    prompt,
    isOpen,
    onClose,
    onUse,
    onEdit,
    onClone,
    onDelete
}) {
    if (!isOpen || !prompt) return null;

    const modeColors = {
        summary: 'bg-blue-100 text-blue-800',
        checkbox: 'bg-green-100 text-green-800'
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl w-full">
                    <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="flex justify-between items-start mb-5">
                            <div>
                                <h3 className="text-xl leading-6 font-bold text-gray-900" id="modal-title">
                                    {prompt.title}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    By {prompt.authorName || 'Anonymous Teacher'}
                                </p>
                            </div>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <h4 className="font-semibold text-gray-900 mb-2">Description</h4>
                                <p className="text-gray-700">{prompt.description || 'No description provided'}</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <h5 className="text-sm font-medium text-gray-500 mb-1">Category</h5>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                                        {prompt.category}
                                    </span>
                                </div>
                                <div>
                                    <h5 className="text-sm font-medium text-gray-500 mb-1">Mode</h5>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${modeColors[prompt.mode]}`}>
                                        {prompt.mode === 'checkbox' ? <CheckSquare className="w-3 h-3 mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
                                        {prompt.mode.charAt(0).toUpperCase() + prompt.mode.slice(1)}
                                    </span>
                                </div>
                                <div>
                                    <h5 className="text-sm font-medium text-gray-500 mb-1">Views</h5>
                                    <span className="text-gray-900 font-medium">{prompt.views || 0}</span>
                                </div>
                                <div>
                                    <h5 className="text-sm font-medium text-gray-500 mb-1">Uses</h5>
                                    <span className="text-gray-900 font-medium">{prompt.usage_count || 0}</span>
                                </div>
                            </div>

                            {prompt.tags && prompt.tags.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-gray-900 mb-2">Tags</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {prompt.tags.map((tag, idx) => (
                                            <span key={idx} className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <h4 className="font-semibold text-gray-900 mb-2">Prompt Content</h4>
                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">{prompt.content}</pre>
                                </div>
                            </div>

                            <div className="text-sm text-gray-500 flex justify-between items-center">
                                <span>Created: {new Date(prompt.created_at).toLocaleString()}</span>
                                {prompt.isPublic ? (
                                    <span className="flex items-center text-green-600"><Globe className="w-4 h-4 mr-1" /> Public</span>
                                ) : (
                                    <span className="flex items-center text-gray-600"><Lock className="w-4 h-4 mr-1" /> Private</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 px-4 py-3 sm:px-6 flex flex-col sm:flex-row sm:justify-between gap-3">
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => onEdit(prompt)}
                                className="inline-flex justify-center items-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                <Edit className="w-4 h-4 mr-2" /> Edit
                            </button>
                            <button
                                type="button"
                                onClick={() => onClone(prompt)}
                                className="inline-flex justify-center items-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                <Copy className="w-4 h-4 mr-2" /> Clone
                            </button>
                            <button
                                type="button"
                                onClick={() => onDelete(prompt._id)}
                                className="inline-flex justify-center items-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => onUse(prompt._id)}
                            className="inline-flex justify-center items-center rounded-md border border-transparent shadow-sm px-6 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                            <Play className="w-4 h-4 mr-2" /> Use Prompt
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
