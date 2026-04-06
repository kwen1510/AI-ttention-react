import React, { useState } from 'react';
import { ChevronDown, Info, HelpCircle, RefreshCw, Plus, Search, Trash2, Save } from 'lucide-react';

export function CriteriaManager({
    scenario,
    onScenarioChange,
    criteriaText,
    onCriteriaChange,
    strictness,
    onStrictnessChange,
    onSave,
    onClear,
    feedback,
    library,
    onLoadPrompt,
    onLoadLibrary
}) {
    const [isOpen, setIsOpen] = useState(true);
    const [showFormatHelp, setShowFormatHelp] = useState(false);

    return (
        <div className="glass-panel mb-8 overflow-hidden bg-white rounded-xl shadow-lg border border-gray-200">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-6 py-4 text-left hover:bg-gray-50 transition-all duration-300"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-400/20 to-teal-500/20 backdrop-blur-sm border border-emerald-300/30">
                            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">Discussion Criteria Setup</h3>
                            <p className="text-sm text-gray-600">Set up your discussion question and criteria checklist</p>
                        </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {isOpen && (
                <div className="border-t border-gray-200 p-6">
                    <div className="space-y-6">
                        {/* Scenario */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Discussion Question/Scenario
                            </label>
                            <textarea
                                value={scenario}
                                onChange={(e) => onScenarioChange(e.target.value)}
                                rows={4}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-vertical"
                                placeholder="Enter the discussion question or scenario context..."
                            />
                        </div>

                        {/* Criteria */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Criteria Checklist (one per line)
                            </label>

                            {/* Format Help */}
                            {showFormatHelp && (
                                <div className="mb-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                    <h5 className="text-sm font-semibold text-blue-800 mb-3 flex items-center">
                                        <Info className="w-4 h-4 mr-2" />
                                        Criteria Format Guide
                                    </h5>
                                    <p className="text-sm text-blue-700 mb-2">Use format: <code className="bg-white px-1 rounded">Description (Rubric)</code></p>
                                    <div className="text-xs text-blue-600">
                                        Example: <span className="text-green-600">Students explain back titration</span> (<span className="text-orange-600">CaCO3 is not soluble</span>)
                                    </div>
                                </div>
                            )}

                            <textarea
                                value={criteriaText}
                                onChange={(e) => onCriteriaChange(e.target.value)}
                                rows={8}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none font-mono text-sm"
                                placeholder="Enter criteria..."
                            />

                            <div className="flex items-center justify-between mt-2">
                                <p className="text-xs text-gray-500">Each line becomes a separate criterion</p>
                                <button
                                    onClick={() => setShowFormatHelp(!showFormatHelp)}
                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                                >
                                    <HelpCircle className="w-3 h-3 mr-1" />
                                    Format Help
                                </button>
                            </div>
                        </div>

                        {/* Strictness */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Evaluation Strictness
                            </label>
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs text-slate-500 font-medium">Lenient</span>
                                    <span className={`text-sm font-semibold ${strictness === 1 ? 'text-green-600' :
                                            strictness === 2 ? 'text-blue-600' : 'text-red-600'
                                        }`}>
                                        {strictness === 1 ? 'Lenient' : strictness === 2 ? 'Moderate' : 'Strict'}
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">Strict</span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={3}
                                    value={strictness}
                                    onChange={(e) => onStrictnessChange(Number(e.target.value))}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                            <button
                                onClick={onClear}
                                className="text-slate-600 hover:text-slate-800 text-sm font-medium flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Clear All
                            </button>
                            <button
                                onClick={onSave}
                                className="btn bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold flex items-center"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Save & Apply
                            </button>
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
