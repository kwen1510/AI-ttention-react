import React from 'react';
import { Sparkles, Clock } from 'lucide-react';

export function SummaryPanel({ summary }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-purple-600" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Discussion Summary</h2>
                </div>
                {summary && (
                    <div className="flex items-center text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
                        <Clock className="w-3 h-3 mr-1" />
                        Updated just now
                    </div>
                )}
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
                {!summary ? (
                    <div className="text-center py-12 text-gray-500">
                        <Sparkles className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg font-medium mb-2">No summary available</p>
                        <p className="text-sm">Discussion summary will appear here as you talk</p>
                    </div>
                ) : (
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 border-l-4 border-purple-400 h-full">
                        <div className="prose prose-purple max-w-none">
                            <div className="text-gray-800 leading-relaxed whitespace-pre-line">
                                {summary}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
