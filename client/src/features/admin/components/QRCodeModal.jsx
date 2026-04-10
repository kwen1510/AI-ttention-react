import React, { useEffect, useRef, useState } from 'react';
import { X, Copy } from 'lucide-react';

export function QRCodeModal({ isOpen, onClose, sessionCode }) {
    const qrRef = useRef(null);
    const [joinUrl, setJoinUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
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
                    setError('Secure join link unavailable. Using the session code link instead.');
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

    if (!isOpen) return null;

    const copyLink = async () => {
        const url = joinUrl || fallbackJoinUrl;
        await navigator.clipboard.writeText(url);
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
                    <div ref={qrRef} />
                </div>

                <div className="mb-4 text-sm text-slate-600">
                    <p>Students can open this link and choose their group number without teacher sign-in.</p>
                    {isLoading ? <p className="mt-2 text-xs text-slate-500">Generating secure join link…</p> : null}
                    {error ? <p className="mt-2 text-xs text-amber-700">{error}</p> : null}
                </div>

                <button
                    onClick={copyLink}
                    className="w-full p-4 bg-gray-50 rounded-lg flex items-center justify-between hover:bg-gray-100 transition-colors"
                >
                    <span className="font-mono text-sm text-gray-600 truncate">
                        {joinUrl || fallbackJoinUrl}
                    </span>
                    <Copy className="w-4 h-4 text-gray-400" />
                </button>
            </div>
        </div>
    );
}
