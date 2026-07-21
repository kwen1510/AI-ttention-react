import React, { useEffect, useRef, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { GraduationCap, AlertCircle } from 'lucide-react';
import { getSupabaseConfig } from '../../../config/supabaseClient.js';
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
    const [captchaToken, setCaptchaToken] = useState(null);
    const [captchaError, setCaptchaError] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const turnstileRef = useRef(null);
    const turnstileSiteKey = getSupabaseConfig().turnstileSiteKey;

    useEffect(() => {
        setCode(String(initialCode || '').trim().toUpperCase());
    }, [initialCode]);

    useEffect(() => {
        setGroup(String(initialGroup || '').trim());
    }, [initialGroup]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const normalizedCode = String(code || '').trim().toUpperCase();
        const parsedGroup = Number.parseInt(group, 10);

        if (!/^[A-Z0-9]{6}$/.test(normalizedCode) || !Number.isFinite(parsedGroup) || parsedGroup <= 0) {
            return;
        }
        if (turnstileSiteKey && !captchaToken) {
            setCaptchaError('Complete the security check before joining.');
            return;
        }

        setIsJoining(true);
        try {
            await onJoin(normalizedCode, parsedGroup, captchaToken);
        } finally {
            setIsJoining(false);
            if (turnstileSiteKey) {
                setCaptchaToken(null);
                turnstileRef.current?.reset();
            }
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
                            placeholder="Enter code"
                            maxLength={6}
                            className="student-join-code-input"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
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

                    {turnstileSiteKey && (
                        <div className="space-y-2">
                            <Turnstile
                                ref={turnstileRef}
                                siteKey={turnstileSiteKey}
                                onSuccess={(token) => {
                                    setCaptchaToken(token);
                                    setCaptchaError('');
                                }}
                                onExpire={() => setCaptchaToken(null)}
                                onError={() => {
                                    setCaptchaToken(null);
                                    setCaptchaError('The security check could not load. Check the connection and try again.');
                                }}
                                options={{
                                    action: 'student_join',
                                    appearance: 'interaction-only',
                                    size: 'flexible',
                                    theme: 'auto'
                                }}
                            />
                            {captchaError && <p className="text-sm text-[var(--danger)]">{captchaError}</p>}
                        </div>
                    )}

                    <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        className="w-full"
                        disabled={isJoining || Boolean(turnstileSiteKey && !captchaToken)}
                    >
                        {isJoining ? 'Joining…' : 'Join with code'}
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
