import React from 'react';
import { GroupCard } from './GroupCard';
import { GraduationCap } from 'lucide-react';

export function GroupGrid({ groups }) {
    if (groups.size === 0) {
        return (
            <div className="text-center py-16">
                <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-200 bg-white/90">
                    <GraduationCap className="w-10 h-10 text-slate-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Waiting for Students</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                    Students will appear here when they join your session.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from(groups.entries()).map(([num, data]) => (
                <GroupCard key={num} groupNumber={num} data={data} />
            ))}
        </div>
    );
}
