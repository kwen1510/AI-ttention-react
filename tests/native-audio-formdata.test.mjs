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
