import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBaseTestEnv } from './_helpers.mjs';

test('OpenAI transcription uses native multipart data without setting its boundary manually', async () => {
    applyBaseTestEnv(10000);
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const originalFetch = globalThis.fetch;
    let request;

    globalThis.fetch = async (url, options) => {
        request = { url, options };
        return {
            ok: true,
            json: async () => ({ text: 'hello class', words: [] })
        };
    };

    try {
        const { transcribeAudioWithOpenAI } = await import('../server/services/openai.js');
        const result = await transcribeAudioWithOpenAI(Buffer.from('audio bytes'), {
            mimeType: 'audio/webm',
            filename: 'class.webm'
        });

        assert.equal(result.text, 'hello class');
        assert.equal(request.url, 'https://api.openai.com/v1/audio/transcriptions');
        assert.equal(request.options.headers.Authorization, 'Bearer test-openai-key');
        assert.equal(request.options.headers['Content-Type'], undefined);
        assert.ok(request.options.body instanceof FormData);

        const audioFile = request.options.body.get('file');
        assert.equal(audioFile.name, 'class.webm');
        assert.equal(audioFile.type, 'audio/webm');
        assert.equal(audioFile.size, 11);
    } finally {
        globalThis.fetch = originalFetch;
        delete process.env.OPENAI_API_KEY;
    }
});

test('OpenAI failures do not expose provider response bodies', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'masked-key-fingerprint-should-not-escape'
    });

    try {
        const { callOpenAIChat } = await import('../server/services/openai.js');
        await assert.rejects(
            () => callOpenAIChat('test-key', { messages: [] }),
            (error) => error.status === 401
                && !error.message.includes('masked-key-fingerprint-should-not-escape')
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('GPT-5 summary requests use the Responses API with minimal reasoning and no stored response', async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
        request = { url, body: JSON.parse(options.body) };
        return { ok: true, json: async () => ({ output_text: '{"groups":[]}' }) };
    };

    try {
        const { callOpenAIResponses } = await import('../server/services/openai.js');
        await callOpenAIResponses('test-key', {
            model: 'gpt-5-nano',
            store: false,
            prompt_cache_key: 'ai-ttention-rolling-summary-v1',
            reasoning: { effort: 'minimal' },
            max_output_tokens: 256,
            input: 'test'
        });
        assert.equal(request.url, 'https://api.openai.com/v1/responses');
        assert.equal(request.body.store, false);
        assert.equal(request.body.reasoning.effort, 'minimal');
        assert.equal(request.body.prompt_cache_key, 'ai-ttention-rolling-summary-v1');
    } finally {
        globalThis.fetch = originalFetch;
    }
});
