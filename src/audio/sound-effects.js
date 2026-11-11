// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

/** Quiet, low-pass friction with a seamless loop for the slime's movement. */
export function createDragSamples(sampleRate) {
    const samples = new Float32Array(Math.round(sampleRate * 0.6));
    let seed = 4621;
    let smooth = 0;
    const edge = Math.round(sampleRate * 0.02);
    for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        smooth += 0.035 * ((seed / 0xffffffff * 2 - 1) - smooth);
        const phase = i / samples.length * Math.PI * 2;
        const fade = Math.min(1, i / edge, (samples.length - 1 - i) / edge);
        samples[i] = smooth * 0.65 * fade + Math.sin(phase * 96) * (0.06 + 0.025 * Math.sin(phase * 3));
    }
    return samples;
}

/** A rounded, falling water-drop pitch with a short, soft attack and tail. */
export function createPopSamples(sampleRate) {
    const samples = new Float32Array(Math.round(sampleRate * 0.095));
    let phase = 0;
    for (let i = 0; i < samples.length; i++) {
        const time = i / sampleRate;
        const frequency = 260 + 1100 * Math.exp(-time * 75);
        phase += 2 * Math.PI * frequency / sampleRate;
        const attack = Math.min(1, time / 0.003);
        const tail = Math.min(1, (samples.length - 1 - i) / (sampleRate * 0.012));
        samples[i] = Math.sin(phase) * 0.65 * attack * Math.exp(-time * 44) * tail;
    }
    return samples;
}
