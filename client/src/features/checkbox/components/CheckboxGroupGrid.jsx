import React from 'react';
import { CheckboxGroupCard } from './CheckboxGroupCard';
import { GraduationCap } from 'lucide-react';
import { EmptyState } from '../../../components/ui/empty-state.jsx';

export function CheckboxGroupGrid({ groups, onRelease }) {
    if (groups.size === 0) {
        return (
            <EmptyState
                icon={GraduationCap}
                title="Waiting for students"
                description="Student groups will appear here after they join. Set up the criteria and start recording when you're ready."
            />
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
