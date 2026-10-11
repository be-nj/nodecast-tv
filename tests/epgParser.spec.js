const test = require('node:test');
const assert = require('node:assert');
const { Readable } = require('stream');
const { parseStreaming } = require('../server/services/epgParser');

function xmltv(programmeCount) {
    const progs = [];
    for (let i = 0; i < programmeCount; i++) {
        progs.push(`<programme start="20261011120000 +0000" stop="20261011130000 +0000" channel="c${i % 7}"><title>P${i}</title></programme>`);
    }
    return `<?xml version="1.0"?><tv><channel id="c0"><display-name>C0</display-name></channel>${progs.join('')}</tv>`;
}

test('keeps every batch when one input chunk completes several batches', async () => {
    // A single chunk holds 3.5 batches - the consumer cannot run in between.
    const input = Readable.from([xmltv(3500)]);
    let total = 0;
    let channels = null;
    for await (const batch of parseStreaming(input, 1000)) {
        if (batch.channels) channels = batch.channels;
        total += batch.programmes.length;
    }
    assert.strictEqual(total, 3500);
    assert.strictEqual(channels.length, 1);
});

test('keeps every batch when input arrives in small chunks', async () => {
    const xml = xmltv(2500);
    const chunks = [];
    for (let i = 0; i < xml.length; i += 512) chunks.push(xml.slice(i, i + 512));
    let total = 0;
    for await (const batch of parseStreaming(Readable.from(chunks), 1000)) {
        total += batch.programmes.length;
    }
    assert.strictEqual(total, 2500);
});
