import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';

export function TranscriptionPanel({ transcription }) {
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const scrollRef = useRef(null);

    // Update history when new transcription arrives
    useEffect(() => {
        if (transcription) {
            setHistory(prev => [transcription, ...prev].slice(0, 50)); // Keep last 50
        }
    }, [transcription]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-blue-600" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Live Transcription</h2>
                </div>
                <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center text-gray-600 hover:text-gray-900 text-sm transition-colors"
                >
                    {showHistory ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                    {showHistory ? 'Hide History' : 'Show History'}
                </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto" ref={scrollRef}>
                {!transcription && history.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg font-medium mb-2">No transcription yet</p>
                        <p className="text-sm">Audio will be transcribed here when recording starts</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Latest Transcript */}
                        {transcription && (
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border-l-4 border-blue-400 animate-fade-in">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded uppercase tracking-wide">
                                        Latest
                                    </span>
                                    <span className="text-xs text-gray-500">Just now</span>
                                </div>
                                <div className="text-gray-800 leading-relaxed">
                                    {transcription.cumulativeText || transcription.text}
                                </div>
                                {transcription.text && (
                                    <div className="text-xs text-gray-500 border-t border-blue-100 pt-2 mt-2">
                                        <span className="font-medium">Chunk:</span> "{transcription.text}"
                                    </div>
                                )}
                            </div>
                        )}

                        {/* History */}
                        {showHistory && history.map((item, index) => (
                            <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-100 opacity-75">
                                <div className="text-gray-700 text-sm">
                                    {item.cumulativeText || item.text}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
