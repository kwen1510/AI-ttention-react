import React, { useState } from 'react';
import { FileText, ChevronDown, RefreshCw, Plus, Search, FlaskConical, Check } from 'lucide-react';

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

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors duration-200"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-sky-700" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">AI Summarization Prompts</h3>
                            <p className="text-sm text-gray-600">Manage and customize AI prompts</p>
                        </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {isOpen && (
                <div className="border-t border-gray-200 p-6">
                    <div className="space-y-4">
                        <textarea
                            value={currentPrompt}
                            onChange={(e) => onPromptChange(e.target.value)}
                            rows={4}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                            placeholder="Enter your custom prompt..."
                        />

                        <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onTest(currentPrompt)}
                                    className="btn btn-muted text-xs px-4 py-2 flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded"
                                >
                                    <FlaskConical className="w-3.5 h-3.5" />
                                    Test
                                </button>
                                <button
                                    onClick={() => onSave(currentPrompt)}
                                    className="btn btn-accent text-xs px-4 py-2 flex items-center gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                    Apply
                                </button>
                                <button
                                    onClick={onReset}
                                    className="text-xs text-gray-500 hover:text-gray-700 px-4 py-2"
                                >
                                    Reset Default
                                </button>
                            </div>
                        </div>

                        {feedback && (
                            <div className={`p-4 rounded-lg border ${feedback.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                                    feedback.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                                        'bg-blue-50 border-blue-200 text-blue-800'
                                }`}>
                                {feedback.message}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
