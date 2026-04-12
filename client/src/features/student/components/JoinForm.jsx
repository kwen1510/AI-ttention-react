import React, { useEffect, useState } from 'react';
import { GraduationCap, AlertCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Field, Input } from '../../../components/ui/field.jsx';
import { Alert } from '../../../components/ui/alert.jsx';
import { Panel } from '../../../components/ui/panel.jsx';

export function JoinForm({
    onJoin,
    error,
    notice = "",
    initialCode = "",
    initialGroup = ""
}) {
    const [code, setCode] = useState(() => String(initialCode || '').trim().toUpperCase());
    const [group, setGroup] = useState(() => String(initialGroup || '').trim());

    useEffect(() => {
        setCode(String(initialCode || '').trim().toUpperCase());
    }, [initialCode]);

    useEffect(() => {
        setGroup(String(initialGroup || '').trim());
    }, [initialGroup]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const normalizedCode = String(code || '').trim().toUpperCase();
        const parsedGroup = Number.parseInt(group, 10);

        if (/^[A-Z0-9]{6}$/.test(normalizedCode) && Number.isFinite(parsedGroup) && parsedGroup > 0) {
            onJoin(normalizedCode, parsedGroup);
        }
    };

    return (
        <div className="page-shell flex min-h-screen items-center justify-center py-12">
            <Panel padding="lg" className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="ui-empty-state__icon mx-auto mb-4 h-20 w-20">
                        <GraduationCap className="h-10 w-10" />
                    </div>
                    <p className="eyebrow">Student access</p>
                    <h1 className="text-3xl font-semibold text-[var(--text)] mb-2">AI(ttention)</h1>
                    <p>Join your group session to begin.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <Field
                        label="Session code"
                        htmlFor="sessionCode"
                        hint="Use the 6-character code shared by your teacher."
                    >
                        <Input
                            type="text"
                            id="sessionCode"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                            placeholder="Enter 6-character code"
                            maxLength={6}
                            className="text-center text-xl font-mono tracking-[0.28em] uppercase"
                            required
                        />
                    </Field>

                    <Field label="Group number" htmlFor="groupNumber">
                        <Input
                            type="number"
                            id="groupNumber"
                            value={group}
                            onChange={(e) => setGroup(e.target.value)}
                            placeholder="Your group number"
                            min={1}
                            max={99}
                            className="text-center text-lg"
                            required
                        />
                    </Field>

                    <Button type="submit" variant="primary" size="lg" className="w-full">
                        Join with code
                    </Button>
                </form>

                {notice && (
                    <Alert className="mt-6" tone="warning" title="Access note">
                        <p>{notice}</p>
                    </Alert>
                )}

                {error && (
                    <Alert className="mt-6" tone="danger" icon={AlertCircle} title="Unable to join">
                        <p>{error}</p>
                    </Alert>
                )}
            </Panel>
        </div>
    );
}
