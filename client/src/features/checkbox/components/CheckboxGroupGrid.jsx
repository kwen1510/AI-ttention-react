import React from 'react';
import { CheckboxGroupCard } from './CheckboxGroupCard';
import { GraduationCap } from 'lucide-react';

export function CheckboxGroupGrid({ groups, onRelease }) {
    if (groups.size === 0) {
        return (
            <div className="text-center py-16">
                <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6 bg-gradient-to-br from-cyan-400/20 to-blue-500/20 backdrop-blur-sm border-2 border-white/40 shadow-lg">
                    <GraduationCap className="w-10 h-10 text-cyan-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Waiting for Students</h3>
                <p className="text-slate-600 max-w-md mx-auto">
                    Student groups will appear here when they join your session. Set up your criteria above and start recording to begin.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from(groups.entries()).map(([num, data]) => (
                <CheckboxGroupCard
                    key={num}
                    groupNumber={num}
                    data={data}
                    onRelease={onRelease}
                />
            ))}
        </div>
    );
}
