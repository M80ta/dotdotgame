// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {createBallElement} from '../elements/ball.js';

/** Keyframes are independent of DOM geometry, so path turns can be tested. */
export function createMoveKeyframes(points) {
    const steps = points.length - 1;
    const frames = [{offset: 0, transform: 'translate(0px, 0px) scale(1, 1)', borderRadius: '50%'}];
    for (let i = 1; i < points.length; i++) {
        const {x, y} = points[i];
        const previous = points[i - 1];
        const horizontal = x !== previous.x;
        frames.push({
            offset: (i - 0.5) / steps,
            transform: `translate(${(previous.x + x) / 2}px, ${(previous.y + y) / 2}px) scale(${horizontal ? '1.3, 0.76' : '0.76, 1.3'})`,
            borderRadius: horizontal ? '44% 56% 56% 44%' : '56% 56% 44% 44%'
        });
        frames.push({offset: i / steps, transform: `translate(${x}px, ${y}px) scale(1, 1)`, borderRadius: '50%'});
    }
    return frames;
}

export class BallAnimator {
    constructor(boardView, window) {
        this.view = boardView;
        this.window = window;
        this.activeAnimation = null;
    }

    get reducedMotion() {
        return this.window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    wait(milliseconds) {
        return this.reducedMotion ? Promise.resolve() : new Promise(resolve => this.window.setTimeout(resolve, milliseconds));
    }

    cancel() {
        this.activeAnimation?.cancel();
        this.activeAnimation = null;
    }

    async move({path, color}) {
        if (this.reducedMotion) return;
        const source = this.view.getCell(path[0].r, path[0].c);
        source.classList.remove('selected');
        const sourceBall = source.querySelector('.ball');
        const ballRect = sourceBall.getBoundingClientRect();
        const root = this.view.root;
        const boardRect = root.getBoundingClientRect();
        const sourceRect = source.getBoundingClientRect();
        const moving = createBallElement(this.view.document, color);
        moving.classList.add('moving-ball');
        moving.style.width = `${ballRect.width}px`;
        moving.style.height = `${ballRect.height}px`;
        moving.style.left = `${ballRect.left - boardRect.left - root.clientLeft + root.scrollLeft}px`;
        moving.style.top = `${ballRect.top - boardRect.top - root.clientTop + root.scrollTop}px`;
        root.appendChild(moving);
        sourceBall.style.visibility = 'hidden';
        const points = path.map(({r, c}) => {
            const rect = this.view.getCell(r, c).getBoundingClientRect();
            return {x: rect.left - sourceRect.left, y: rect.top - sourceRect.top};
        });
        let animation;
        try {
            animation = moving.animate(createMoveKeyframes(points), {
                duration: Math.min(3600, Math.max(180, (path.length - 1) * 110)),
                easing: 'ease-in-out', fill: 'forwards'
            });
            this.activeAnimation = animation;
            await animation.finished;
        } finally {
            if (this.activeAnimation === animation) this.activeAnimation = null;
            sourceBall.style.visibility = '';
            moving.remove();
        }
    }

    async clear(cells) {
        if (cells.size === 0) return;
        this.view.markClearing(cells);
        await this.wait(240);
    }
}
