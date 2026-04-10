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
    const [qrUrl, setQrUrl] = useState('');
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
        setQrUrl(fallbackJoinUrl);
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
                    setQrUrl(fallbackJoinUrl);
                }
            } catch (err) {
                if (!isCancelled) {
                    console.error('Failed to load direct join link:', err);
                    setError('Direct join link unavailable. Using the standard session code link instead.');
                    setQrUrl(fallbackJoinUrl);
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
        const targetUrl = qrUrl || fallbackJoinUrl;
        if (isOpen && sessionCode && targetUrl && window.QRCode && qrRef.current) {
            qrRef.current.innerHTML = '';
            try {
                new window.QRCode(qrRef.current, {
                    text: targetUrl,
                    width: 200,
                    height: 200,
                    correctLevel: window.QRCode.CorrectLevel?.L
                });
            } catch (err) {
                console.error('Failed to render join QR code:', err);
                if (targetUrl !== fallbackJoinUrl) {
                    setQrUrl(fallbackJoinUrl);
                    setError('QR code switched to the compact session-code link for reliability.');
                } else {
                    setError('Unable to render the QR code. Use the copy button instead.');
                }
            }
        }
    }, [fallbackJoinUrl, isOpen, qrUrl, sessionCode]);

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
                        Scan the QR code for the compact session link, or copy the direct join link below. Students can choose their group number without teacher sign-in.
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

                    {joinUrl && joinUrl !== fallbackJoinUrl ? (
                        <p className="text-xs copy-muted">
                            The QR code uses the shorter session-code link for reliable scanning. The copied link opens the direct join flow.
                        </p>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}
