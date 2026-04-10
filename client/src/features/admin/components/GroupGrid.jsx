import React from 'react';
import { GroupCard } from './GroupCard';
import { GraduationCap } from 'lucide-react';
import { EmptyState } from '../../../components/ui/empty-state.jsx';

export function GroupGrid({ groups }) {
    if (groups.size === 0) {
        return (
            <EmptyState
                icon={GraduationCap}
                title="Waiting for students"
                description="Student groups will appear here as soon as they join the session."
            />
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
