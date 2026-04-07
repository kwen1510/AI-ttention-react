import React, { useEffect, useRef } from 'react';
import { X, Copy } from 'lucide-react';

export function QRCodeModal({ isOpen, onClose, sessionCode }) {
    const qrRef = useRef(null);

    useEffect(() => {
        if (isOpen && sessionCode && window.QRCode && qrRef.current) {
            qrRef.current.innerHTML = '';
            new window.QRCode(qrRef.current, {
                text: `${window.location.origin}/student?code=${sessionCode}`,
                width: 200,
                height: 200
            });
        }
    }, [isOpen, sessionCode]);

    if (!isOpen) return null;

    const copyLink = () => {
        const url = `${window.location.origin}/student?code=${sessionCode}`;
        navigator.clipboard.writeText(url);
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

                <button
                    onClick={copyLink}
                    className="w-full p-4 bg-gray-50 rounded-lg flex items-center justify-between hover:bg-gray-100 transition-colors"
                >
                    <span className="font-mono text-sm text-gray-600 truncate">
                        {`${window.location.origin}/student?code=${sessionCode}`}
                    </span>
                    <Copy className="w-4 h-4 text-gray-400" />
                </button>
            </div>
        </div>
    );
}
