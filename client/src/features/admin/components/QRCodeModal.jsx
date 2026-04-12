import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
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
    const [qrImageUrl, setQrImageUrl] = useState('');
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const joinUrl = useMemo(
        () => `${window.location.origin}/s?c=${sessionCode}`,
        [sessionCode]
    );

    useEffect(() => {
        if (!isOpen || !sessionCode || !joinUrl) {
            setQrImageUrl('');
            return undefined;
        }

        let isCancelled = false;
        setQrImageUrl('');
        setError('');

        const renderQrCode = async () => {
            try {
                const dataUrl = await QRCode.toDataURL(joinUrl, {
                    errorCorrectionLevel: 'L',
                    margin: 1,
                    width: 200
                });

                if (!isCancelled) {
                    setQrImageUrl(dataUrl);
                }
            } catch (err) {
                if (isCancelled) {
                    return;
                }

                console.error('Failed to render join QR code:', err);
                setQrImageUrl('');
                setError('Unable to render the QR code. Students can still enter the session code manually.');
            }
        };

        void renderQrCode();

        return () => {
            isCancelled = true;
        };
    }, [isOpen, joinUrl, sessionCode]);

    const copyLink = async () => {
        await navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle>Student access</DialogTitle>
                    <DialogDescription>
                        Students can type this session code on the student page, or use the code-based link below. No tokenized join link is required.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="ui-panel ui-panel--subtle ui-panel--pad-lg text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                            Session code
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-[0.22em] text-[var(--text)]">
                            {sessionCode || '------'}
                        </p>
                    </div>

                    <div className="flex justify-center">
                        <div className="ui-panel ui-panel--subtle ui-panel--pad-lg inline-flex w-fit">
                            <div className="flex h-[200px] w-[200px] items-center justify-center">
                                {qrImageUrl ? (
                                    <img
                                        src={qrImageUrl}
                                        alt="Student session QR code"
                                        className="block h-[200px] w-[200px] rounded-md"
                                    />
                                ) : (
                                    <QrCode className="h-10 w-10 text-[var(--text-muted)]" />
                                )}
                            </div>
                        </div>
                    </div>

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
                        <span className="min-w-0 flex-1 truncate font-mono text-xs copy-muted">{joinUrl}</span>
                        <Button onClick={copyLink} variant="secondary" size="sm" className="shrink-0">
                            <Copy className="h-4 w-4" />
                            Copy
                        </Button>
                    </div>

                    <p className="text-xs copy-muted">
                        Students on other devices can open the student page directly and enter the session code shown above.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
