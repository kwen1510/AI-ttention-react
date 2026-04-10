import React, { useEffect, useRef, useState } from 'react';
import { Copy, QrCode } from 'lucide-react';
import { Alert } from '../../../components/ui/alert.jsx';
import { Button } from '../../../components/ui/button.jsx';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog.jsx';

export function QRCodeModal({ isOpen, onClose, sessionCode }) {
    const qrRef = useRef(null);
    const [joinUrl, setJoinUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const fallbackJoinUrl = `${window.location.origin}/student?code=${sessionCode}`;

    useEffect(() => {
        if (!isOpen || !sessionCode) {
            return undefined;
        }

        let isCancelled = false;
        setJoinUrl(fallbackJoinUrl);
        setError('');
        setIsLoading(true);

        const loadJoinUrl = async () => {
            try {
                const response = await fetch(`/api/session/${sessionCode}/join-token`, {
                    method: 'POST'
                });

                if (!response.ok) {
                    throw new Error(`Failed to generate join link (${response.status})`);
                }

                const data = await response.json();
                if (!isCancelled && data?.url) {
                    setJoinUrl(data.url);
                }
            } catch (err) {
                if (!isCancelled) {
                    console.error('Failed to load secure join link:', err);
                    setError('Direct join link unavailable. Using the standard session code link instead.');
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false);
                }
            }
        };

        loadJoinUrl();

        return () => {
            isCancelled = true;
        };
    }, [fallbackJoinUrl, isOpen, sessionCode]);

    useEffect(() => {
        const targetUrl = joinUrl || fallbackJoinUrl;
        if (isOpen && sessionCode && targetUrl && window.QRCode && qrRef.current) {
            qrRef.current.innerHTML = '';
            new window.QRCode(qrRef.current, {
                text: targetUrl,
                width: 200,
                height: 200
            });
        }
    }, [fallbackJoinUrl, isOpen, joinUrl, sessionCode]);

    const copyLink = async () => {
        const url = joinUrl || fallbackJoinUrl;
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle>Student join link</DialogTitle>
                    <DialogDescription>
                        Students can open this link and choose their group number. The student page does not require teacher sign-in.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="ui-panel ui-panel--subtle ui-panel--pad-lg flex justify-center">
                        <div ref={qrRef} className="min-h-[200px] min-w-[200px] flex items-center justify-center">
                            {!joinUrl ? <QrCode className="h-10 w-10 text-[var(--text-muted)]" /> : null}
                        </div>
                    </div>

                    {isLoading ? (
                        <Alert tone="primary">
                            <p>Generating student join link...</p>
                        </Alert>
                    ) : null}

                    {error ? (
                        <Alert tone="warning">
                            <p>{error}</p>
                        </Alert>
                    ) : null}

                    {copied ? (
                        <Alert tone="success">
                            <p>Join link copied to clipboard.</p>
                        </Alert>
                    ) : null}

                    <div className="modal-copy-block">
                        <span className="truncate text-sm copy-muted">{joinUrl || fallbackJoinUrl}</span>
                        <Button onClick={copyLink} variant="secondary" size="sm">
                            <Copy className="h-4 w-4" />
                            Copy
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
