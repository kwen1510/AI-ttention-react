import React, { useState } from 'react';
import { GraduationCap, AlertCircle } from 'lucide-react';

export function JoinForm({ onJoin, error, notice = "", hasJoinToken = false }) {
    const [group, setGroup] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (hasJoinToken && group) {
            onJoin(group);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 mx-auto rounded-full bg-blue-50 text-blue-600 mb-4">
                        <GraduationCap className="w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">AI(ttention)</h1>
                    <p className="text-gray-600">Join your group session to start learning</p>
                </div>

                {hasJoinToken ? (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="groupNumber" className="block text-sm font-medium text-gray-700 mb-2">
                                Group Number
                            </label>
                            <input
                                type="number"
                                id="groupNumber"
                                value={group}
                                onChange={(e) => setGroup(e.target.value)}
                                placeholder="Your group number"
                                min={1}
                                max={99}
                                className="w-full px-4 py-3 text-center text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 px-6 rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                            Join Session
                        </button>
                    </form>
                ) : (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-5 text-sm text-blue-900">
                        Session access now requires a teacher-generated invite link.
                    </div>
                )}

                {notice && (
                    <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <span className="text-amber-800 text-sm font-medium">{notice}</span>
                    </div>
                )}

                {error && (
                    <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <span className="text-red-800 text-sm font-medium">{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
