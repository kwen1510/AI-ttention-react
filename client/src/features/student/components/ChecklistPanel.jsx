import React, { useEffect, useState } from 'react';
import { CheckSquare, Clock, CheckCircle, Circle, AlertCircle } from 'lucide-react';

export function ChecklistPanel({ checklist, isReleased }) {
    // If not released, show waiting state
    if (!isReleased && (!checklist || checklist.length === 0)) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                            <CheckSquare className="w-5 h-5 text-green-600" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900">Discussion Checklist</h2>
                    </div>
                </div>
                <div className="flex-1 p-6 flex flex-col justify-center items-center text-center text-gray-500">
                    <Clock className="w-16 h-16 mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">Waiting for teacher to release checklist</p>
                    <p className="text-sm max-w-sm">
                        Once released, you'll see the criteria and your progress here.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <CheckSquare className="w-5 h-5 text-green-600" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Group Checklist</h2>
                </div>
                <div className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200 font-medium">
                    Live Updates
                </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto space-y-3">
                {checklist.map((item, index) => {
                    let bgColor = 'bg-gray-50';
                    let borderColor = 'border-gray-200';
                    let iconColor = 'text-gray-400';

                    if (item.status === 'green') {
                        bgColor = 'bg-green-50';
                        borderColor = 'border-green-200';
                        iconColor = 'text-green-600';
                    } else if (item.status === 'red') {
                        bgColor = 'bg-red-50';
                        borderColor = 'border-red-200';
                        iconColor = 'text-red-600';
                    }

                    return (
                        <div key={index} className={`flex items-start space-x-3 p-4 ${bgColor} ${borderColor} border rounded-lg transition-all duration-300`}>
                            <div className="flex-shrink-0 mt-1">
                                {item.completed ? (
                                    <CheckCircle className={`w-5 h-5 ${iconColor}`} />
                                ) : (
                                    <Circle className={`w-5 h-5 ${iconColor}`} />
                                )}
                            </div>
                            <div className="flex-1">
                                <p className={`text-sm font-medium ${item.status === 'green' ? 'text-green-900' : 'text-gray-900'}`}>
                                    {item.description}
                                </p>
                                {item.rubric && (
                                    <p className="text-xs text-gray-500 mt-1 italic">
                                        Rubric: {item.rubric}
                                    </p>
                                )}
                                {item.quote && (
                                    <div className={`mt-2 text-xs p-2 rounded bg-white bg-opacity-60 border-l-2 ${item.status === 'green' ? 'border-green-400 text-green-800' :
                                            item.status === 'red' ? 'border-red-400 text-red-800' : 'border-gray-300 text-gray-600'
                                        }`}>
                                        "{item.quote}"
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
