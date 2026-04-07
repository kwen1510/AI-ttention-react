import React, { useEffect, useRef, useState } from 'react';
import { X, Copy } from 'lucide-react';

export function QRCodeModal({ isOpen, onClose, sessionCode }) {
    const qrRef = useRef(null);
    const [joinUrl, setJoinUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function loadJoinLink() {
            if (!isOpen || !sessionCode) {
                if (!cancelled) {
                    setJoinUrl('');
                    setError('');
                }
                return;
            }

            setLoading(true);
            setError('');

            try {
                const response = await fetch(`/api/session/${encodeURIComponent(sessionCode)}/join-token`, {
                    method: 'POST'
                });
                const data = await response.json();

                if (cancelled) return;

                if (!response.ok) {
                    throw new Error(data.error || `Failed to generate join link (${response.status})`);
                }

                setJoinUrl(data.url || '');
            } catch (err) {
                if (cancelled) return;
                setJoinUrl('');
                setError(err.message || 'Failed to generate join link');
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadJoinLink();

        return () => {
            cancelled = true;
        };
    }, [isOpen, sessionCode]);

    useEffect(() => {
        if (isOpen && joinUrl && window.QRCode && qrRef.current) {
            qrRef.current.innerHTML = '';
            new window.QRCode(qrRef.current, {
                text: joinUrl,
                width: 200,
                height: 200
            });
        }
    }, [isOpen, joinUrl]);

    if (!isOpen) return null;

    const copyLink = () => {
        if (!joinUrl) return;
        navigator.clipboard.writeText(joinUrl);
        alert('Link copied!');
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold">Join Session</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex justify-center mb-6">
                    {loading ? (
                        <div className="text-sm text-gray-500">Generating secure join link...</div>
                    ) : error ? (
                        <div className="text-sm text-red-600 text-center">{error}</div>
                    ) : (
                        <div ref={qrRef} />
                    )}
                </div>

                <button
                    onClick={copyLink}
                    disabled={!joinUrl}
                    className="w-full p-4 bg-gray-50 rounded-lg flex items-center justify-between hover:bg-gray-100 transition-colors"
                >
                    <span className="font-mono text-sm text-gray-600 truncate">
                        {joinUrl || 'Join link unavailable'}
                    </span>
                    <Copy className="w-4 h-4 text-gray-400" />
                </button>
            </div>
        </div>
    );
}
