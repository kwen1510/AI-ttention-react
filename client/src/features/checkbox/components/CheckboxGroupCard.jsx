import React, { useState } from 'react';
import { CheckCircle, Circle, ChevronDown, ChevronUp, Send, Check } from 'lucide-react';

export function CheckboxGroupCard({ groupNumber, data, onRelease }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const completedCount = data.checkboxes.filter(c => c.completed).length;
    const totalCount = data.checkboxes.length;
    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-xl">
            {/* Header */}
            <div className="p-4 sm:p-6 bg-gray-100 text-black border-t border-gray-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-lg border border-gray-300">
                            {groupNumber}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Group {groupNumber}</h3>
                            <p className="text-sm opacity-90">{completedCount}/{totalCount} criteria completed</p>
                        </div>
                    </div>
                    <button
                        onClick={() => onRelease(groupNumber)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1 ${data.isReleased
                                ? 'bg-green-500 hover:bg-green-600 text-white border border-green-600'
                                : 'bg-white hover:bg-slate-50 text-black border border-slate-200'
                            }`}
                    >
                        {data.isReleased ? <Check className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                        <span>{data.isReleased ? 'Checklist Released' : 'Release Checklist'}</span>
                    </button>
                </div>
                <div className="mt-3">
                    <div className="flex items-center justify-between text-sm mb-2">
                        <span>Progress</span>
                        <span>{completionRate}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                            className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${completionRate}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            {/* Checkbox List */}
            <div className="p-6">
                <div className="space-y-3">
                    {data.checkboxes.map((checkbox) => {
                        let bgColor = 'bg-gray-50';
                        let borderColor = 'border-gray-200';
                        let checkColor = 'text-gray-400';
                        let textColor = 'text-gray-700';

                        if (checkbox.status === 'green') {
                            bgColor = 'bg-green-50';
                            borderColor = 'border-green-200';
                            checkColor = 'text-green-600';
                            textColor = 'text-green-800';
                        } else if (checkbox.status === 'red') {
                            bgColor = 'bg-red-50';
                            borderColor = 'border-red-200';
                            checkColor = 'text-red-600';
                            textColor = 'text-red-800';
                        }

                        return (
                            <div key={checkbox.id} className={`flex items-start space-x-3 p-3 ${bgColor} ${borderColor} border rounded-lg`}>
                                <div className="flex-shrink-0 mt-1">
                                    {checkbox.completed ?
                                        <CheckCircle className={`w-5 h-5 ${checkColor}`} /> :
                                        <Circle className={`w-5 h-5 ${checkColor}`} />
                                    }
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={`text-sm font-medium ${textColor} mb-1`}>
                                        {checkbox.description}
                                    </div>
                                    <div className="text-xs text-gray-600 italic mb-2">
                                        Rubric: {checkbox.rubric}
                                    </div>
                                    {checkbox.quote && (
                                        <div className={`text-xs ${textColor} bg-white bg-opacity-50 rounded px-2 py-1 border-l-2 ${checkbox.status === 'green' ? 'border-green-400' :
                                                checkbox.status === 'red' ? 'border-red-400' : 'border-gray-400'
                                            }`}>
                                            "{checkbox.quote}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Transcripts */}
                {data.transcripts.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-gray-700">Discussion Transcripts ({data.transcripts.length})</h4>
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors flex items-center"
                            >
                                {isExpanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                                {isExpanded ? 'Show Less' : 'Show All'}
                            </button>
                        </div>

                        {/* Latest Transcript */}
                        <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-blue-700">Latest</span>
                                <span className="text-xs text-blue-600">Segment {data.transcripts.length}</span>
                            </div>
                            <div className="text-gray-800 whitespace-pre-wrap break-words">
                                {data.transcripts[data.transcripts.length - 1].text}
                            </div>
                        </div>

                        {/* All Transcripts */}
                        {isExpanded && (
                            <div className="text-sm bg-gray-50 border border-gray-200 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-gray-600">Full Transcript</span>
                                </div>
                                <div className="text-gray-800 whitespace-pre-wrap break-words">
                                    {data.transcripts.map(t => t.text).join(' ')}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
