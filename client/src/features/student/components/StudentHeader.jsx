import React from 'react';
import { GraduationCap } from 'lucide-react';

export function StudentHeader({
    sessionCode,
    groupNumber,
    isConnected,
    isRecording,
    isPageVisible,
    elapsedTime
}) {
    // Format elapsed time
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="surface surface--padded surface--static flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-200 shadow-sm">
                    <GraduationCap className="w-5 h-5 text-slate-700" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-3">
                        AI(ttention)
                        <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-ping-slow' : 'bg-red-400'}`} />
                            <span className={`text-xs font-medium ${isConnected ? 'text-slate-700' : 'text-red-500'}`}>
                                {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                        </span>
                    </h2>
                    <p className="text-sm text-slate-600">
                        Session <span className="font-mono font-bold">{sessionCode || '-'}</span> •
                        Group <span className="font-bold">{groupNumber || '-'}</span> •
                        Elapsed <span className="font-mono font-bold">{formatTime(elapsedTime)}</span>
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${isRecording
                        ? (isPageVisible ? 'bg-red-100 text-red-800' : 'bg-sky-100 text-sky-800 animate-pulse')
                        : 'bg-sky-100 text-sky-700'
                    }`}>
                    <span className={`w-2 h-2 rounded-full ${isRecording ? (isPageVisible ? 'bg-red-400' : 'bg-sky-400') : 'bg-sky-400'}`} />
                    <span className="text-sm font-medium">
                        {isRecording
                            ? (isPageVisible ? 'Recording...' : 'Recording (Background)')
                            : 'Waiting...'}
                    </span>
                </div>
            </div>
        </div>
    );
}
