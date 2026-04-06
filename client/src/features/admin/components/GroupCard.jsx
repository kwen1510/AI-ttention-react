import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function GroupCard({ groupNumber, data }) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Format summary text with HTML-like structure
    const formatSummary = (text) => {
        if (!text) return null;
        return text.split('\n').map((line, i) => (
            <p key={i} className="mb-2">{line}</p>
        ));
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-xl">
            {/* Header */}
            <div className="bg-white text-black p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <span className="text-lg font-bold">{groupNumber}</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold">Group {groupNumber}</h3>
                            <p className="text-gray-500 text-sm">
                                {data.transcripts.length} segments
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        {data.isActive ? (
                            <>
                                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                                <span className="text-sm font-medium">Active</span>
                            </>
                        ) : (
                            <>
                                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                                <span className="text-sm">Waiting</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="p-6">
                {/* Summary */}
                <div className="mb-6">
                    <h4 className="font-semibold text-gray-900 mb-2">Live Summary</h4>
                    {data.summary ? (
                        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border-l-4 border-purple-400 text-sm text-gray-800">
                            {formatSummary(data.summary.text)}
                        </div>
                    ) : (
                        <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500 text-sm">
                            No summary available yet
                        </div>
                    )}
                </div>

                {/* Transcripts */}
                <div>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center text-gray-600 hover:text-gray-900 mb-4 text-sm font-medium"
                    >
                        {isExpanded ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                        {isExpanded ? 'Show Less' : 'Show Full Transcript'}
                    </button>

                    {isExpanded && (
                        <div className="space-y-3 max-h-60 overflow-y-auto">
                            {data.cumulativeTranscript ? (
                                <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-400 text-sm text-gray-800">
                                    {data.cumulativeTranscript}
                                </div>
                            ) : (
                                data.transcripts.slice().reverse().map((t, i) => (
                                    <div key={i} className="bg-gray-50 rounded p-3 text-sm">
                                        <p className="text-gray-800">{t.text}</p>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {new Date(t.timestamp).toLocaleTimeString()}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
