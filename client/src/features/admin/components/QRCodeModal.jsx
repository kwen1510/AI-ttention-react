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
            <DialogContent size="md" className="student-access-modal">
                <DialogHeader>
                    <DialogTitle>Student access</DialogTitle>
                    <DialogDescription>
                        Scan this QR code or enter the session code on the student page.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="ui-panel ui-panel--subtle ui-panel--pad-md text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                            Session code
                        </p>
                        <p className="mt-1 text-[2rem] font-semibold leading-none tracking-[0.18em] text-[var(--text)] sm:text-[2.15rem]">
                            {sessionCode || '------'}
                        </p>
                    </div>

                    <div className="flex justify-center">
                        <div className="ui-panel ui-panel--subtle ui-panel--pad-md inline-flex w-fit">
                            <div className="flex h-[176px] w-[176px] items-center justify-center sm:h-[184px] sm:w-[184px]">
                                {qrImageUrl ? (
                                    <img
                                        src={qrImageUrl}
                                        alt="Student session QR code"
                                        className="block h-[176px] w-[176px] rounded-md sm:h-[184px] sm:w-[184px]"
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

                    <div className="modal-copy-block student-access-modal__copy-row">
                        <span className="student-access-modal__link copy-muted">{joinUrl}</span>
                        <Button onClick={copyLink} variant="secondary" size="sm" className="student-access-modal__copy-button">
                            <Copy className="h-4 w-4" />
                            Copy link
                        </Button>
                    </div>

                    <p className="text-[11px] leading-5 copy-muted">Manual entry still works on any device using the session code shown above.</p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
