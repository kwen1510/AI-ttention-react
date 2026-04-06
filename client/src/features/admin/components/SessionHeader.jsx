import React from 'react';
import { Play, Square, QrCode } from 'lucide-react';

export function SessionHeader({
    sessionCode,
    isConnected,
    isRecording,
    onStartRecording,
    onStopRecording,
    onOpenQR,
    interval,
    onIntervalChange
}) {
    return (
        <div className="control-bar mx-4 sm:mx-6 md:mx-8 my-4">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 md:gap-4 w-full">
                {/* Left group */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3 flex-wrap">
                    <button
                        onClick={onOpenQR}
                        className="session-code-display flex items-center justify-center gap-3 min-h-touch"
                    >
                        <span className="text-xs sm:text-sm text-slate-600 font-medium">Session</span>
                        <span className="session-code-text">{sessionCode || '-'}</span>
                    </button>

                    <div className={`status-pill ${isConnected ? 'status-pill--connected' : 'bg-red-100 text-red-700'} min-h-touch`}>
                        <div className={`status-dot ${isConnected ? 'bg-green-400 animate-ping-slow' : 'bg-red-400'}`} />
                        <span className="text-xs md:text-sm">
                            {isConnected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>

                    <div className="interval-control min-h-touch">
                        <label className="text-xs sm:text-sm font-semibold text-slate-700 whitespace-nowrap">
                            Interval
                        </label>
                        <input
                            type="number"
                            min={10}
                            max={120}
                            value={interval}
                            onChange={(e) => onIntervalChange(Number(e.target.value))}
                            className="w-16 px-2 py-1 border rounded"
                        />
                        <span className="text-xs sm:text-sm text-slate-600 font-medium">sec</span>
                    </div>
                </div>

                {/* Right group */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3">
                    <button
                        onClick={onStartRecording}
                        disabled={isRecording}
                        className={`btn flex items-center justify-center text-sm sm:text-base min-h-touch ${isRecording
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-green-500 hover:bg-green-600 text-white'
                            }`}
                    >
                        <Play className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                        <span>Start Recording</span>
                    </button>

                    <button
                        onClick={onStopRecording}
                        disabled={!isRecording}
                        className={`btn flex items-center justify-center text-sm sm:text-base min-h-touch ${!isRecording
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-red-500 hover:bg-red-600 text-white'
                            }`}
                    >
                        <Square className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                        <span>Stop Recording</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
