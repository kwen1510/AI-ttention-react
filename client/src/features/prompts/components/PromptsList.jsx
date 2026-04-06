import React from 'react';
import { Globe, Lock, FileText, CheckSquare, Eye, Play } from 'lucide-react';

export function PromptsList({ prompts, onView }) {
    if (prompts.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="mx-auto h-12 w-12 text-gray-400">
                    <FileText className="h-12 w-12" />
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No prompts found</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating a new prompt.</p>
            </div>
        );
    }

    const modeColors = {
        summary: 'bg-blue-100 text-blue-800',
        checkbox: 'bg-green-100 text-green-800'
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
                    <div
                        key={prompt._id}
                        onClick={() => onView(prompt)}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col h-full"
                    >
                        <div className="p-6 flex-1">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex-1 min-w-0 mr-4">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2 truncate" title={prompt.title}>
                                        {prompt.title}
                                    </h3>
                                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                                        {prompt.description || 'No description provided'}
                                    </p>
                                </div>
                                <div className="flex-shrink-0">
                                    {prompt.isPublic ? (
                                        <Globe className="w-4 h-4 text-green-500" title="Public" />
                                    ) : (
                                        <Lock className="w-4 h-4 text-gray-400" title="Private" />
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center space-x-2 mb-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${modeColors[prompt.mode] || 'bg-gray-100 text-gray-800'}`}>
                                    <ModeIcon className="w-3 h-3 mr-1" />
                                    {prompt.mode.charAt(0).toUpperCase() + prompt.mode.slice(1)}
                                </span>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                    {prompt.category}
                                </span>
                            </div>

                            {prompt.tags && prompt.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-4">
                                    {prompt.tags.slice(0, 3).map((tag, idx) => (
                                        <span key={idx} className="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                                            {tag}
                                        </span>
                                    ))}
                                    {prompt.tags.length > 3 && (
                                        <span className="text-xs text-gray-500 flex items-center">
                                            +{prompt.tags.length - 3} more
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                            <div className="flex items-center space-x-4">
                                <span className="flex items-center" title="Views">
                                    <Eye className="w-4 h-4 mr-1" />
                                    {prompt.views || 0}
                                </span>
                                <span className="flex items-center" title="Uses">
                                    <Play className="w-4 h-4 mr-1" />
                                    {prompt.usage_count || 0}
                                </span>
                            </div>
                            <div className="text-right">
                                <div className="font-medium text-gray-700 truncate max-w-[100px]">
                                    {prompt.authorName || 'Anonymous'}
                                </div>
                                <div className="text-xs">
                                    {new Date(prompt.created_at).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
