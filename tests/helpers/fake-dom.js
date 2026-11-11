import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoardView} from '../../src/board/board-view.js';
import {GameController} from '../../src/game/controller.js';
import {BallAnimator} from '../../src/ui/ball-animator.js';
import {GameUI} from '../../src/ui/game-ui.js';
import {HighScoreStore} from '../../src/services/high-score.js';
import {GameSessionStore} from '../../src/services/game-session.js';
import {I18n} from '../../src/i18n/translator.js';

export const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

export function createMemoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

export function createAudioSpy() {
    const calls = [];
    return {
        enabled: true, calls,
        setEnabled(value) { this.enabled = value; calls.push(['enabled', value]); },
        playSelect() { calls.push(['select']); },
        startMove() {
            const call = ['move', false];
            calls.push(call);
            return () => { call[1] = true; };
        },
        playClear(count) { if (count > 0) calls.push(['clear', count]); },
        stopAll() { calls.push(['stop-all']); }
    };
}

export function createApp({size = 8, batch = 3, reducedMotion = true, deferAnimation = false, deferWait = false, storage = createMemoryStorage(), language = 'zh-TW', audio = createAudioSpy(), rankingsFactory} = {}) {
    const animations = [];
    const waits = [];
    const errors = [];
    let randomValues = [];
    const document = {activeElement: null};
    class Element {
        constructor() {
            this.children = [];
            this.style = {setProperty(name, value) { this[name] = String(value); }};
            this.dataset = {};
            this.attributes = {};
            this.listeners = {};
            this.className = '';
            this.value = '';
            this.clientLeft = this.clientTop = 2;
            this.scrollLeft = this.scrollTop = 0;
            this.classList = {
                add: (...names) => this.changeClasses(names, true),
                remove: (...names) => this.changeClasses(names, false),
                contains: name => this.className.split(/\s+/).includes(name),
                toggle: (name, force) => this.changeClasses([name], force ?? !this.classList.contains(name))
            };
        }
        changeClasses(names, add) {
            const classes = new Set(this.className.split(/\s+/).filter(Boolean));
            names.forEach(name => add ? classes.add(name) : classes.delete(name));
            this.className = [...classes].join(' ');
        }
        set innerHTML(value) {
            assert.equal(value, '');
            this.children.forEach(child => { child.parentElement = null; });
            this.children = [];
        }
        appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
        remove() {
            if (this.parentElement) {
                this.parentElement.children = this.parentElement.children.filter(child => child !== this);
                this.parentElement = null;
            }
        }
        contains(element) { return Boolean(element) && (this === element || this.children.some(child => child.contains(element))); }
        focus() { document.activeElement = this; }
        setAttribute(name, value) { this.attributes[name] = value; }
        getAttribute(name) { return this.attributes[name] ?? null; }
        addEventListener(name, listener) { this.listeners[name] = listener; }
        querySelector(selector) {
            if (selector === '.ball') return this.children.find(child => child.classList.contains('ball'));
            const match = selector.match(/\[data-row="(\d+)"\]\[data-col="(\d+)"\]/);
            assert.ok(match, `Unexpected selector: ${selector}`);
            return this.children.find(child => Number(child.dataset.row) === Number(match[1]) && Number(child.dataset.col) === Number(match[2]));
        }
        getBoundingClientRect() {
            if (this.classList.contains('ball')) {
                const parent = this.parentElement.getBoundingClientRect();
                return {left: parent.left + 5, top: parent.top + 5, width: 36, height: 36};
            }
            return {left: Number(this.dataset.col ?? 0) * 51, top: Number(this.dataset.row ?? 0) * 51, width: 46, height: 46};
        }
        animate(keyframes, options) {
            let resolve;
            let reject;
            const finished = deferAnimation ? new Promise((res, rej) => { resolve = res; reject = rej; }) : Promise.resolve();
            const animation = {element: this, keyframes, options, finished, resolve, cancel() { reject?.(new Error('Animation cancelled')); }};
            animations.push(animation);
            return animation;
        }
    }
    const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
    const translatedElements = [...html.matchAll(/<[a-z][a-z0-9-]*\b([^>]*\bdata-i18n(?:-[a-z-]+)?="[^"]+"[^>]*)>/g)].map(([, attributes]) => {
        const values = Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
        const element = elements[values.id] ?? new Element();
        for (const [name, value] of Object.entries(values)) element.setAttribute(name, value);
        return element;
    });
    document.documentElement = new Element();
    document.querySelectorAll = selector => {
        const attribute = selector.slice(1, -1);
        return translatedElements.filter(element => element.getAttribute(attribute) !== null);
    };
    elements.boardSizeSelect.value = String(size);
    elements.queueSizeSelect.value = String(batch);
    new Element().appendChild(elements.playerTowerFill);
    new Element().appendChild(elements.kingTowerFill);
    document.getElementById = id => elements[id];
    document.createElement = () => new Element();
    const i18n = new I18n({getStorage: () => storage, language});
    const ui = new GameUI(document, i18n);
    const view = new BoardView(elements.gameBoard, document, i18n);
    const window = {
        matchMedia: () => ({matches: reducedMotion}),
        setTimeout: callback => deferWait ? waits.push(callback) : queueMicrotask(callback)
    };
    const animator = new BallAnimator(view, window);
    const rankings = rankingsFactory?.({document, i18n});
    const controller = new GameController({
        ui, boardView: view, animator, audio, rankings,
        store: new HighScoreStore(() => storage),
        sessionStore: new GameSessionStore(() => storage),
        random: () => randomValues.length ? randomValues.shift() : 0.37,
        onError: error => errors.push(error)
    });
    rankings?.attach(controller);
    controller.start();
    return {
        controller, ui, view, animator, document, elements, animations, waits, errors, storage, i18n, audio, rankings,
        setRandom: values => { randomValues = values.slice(); },
        click: (r, c) => view.getCell(r, c).listeners.click(),
        emptyBoard() {
            const game = controller.game;
            game.board.cells = Array.from({length: game.board.size}, () => Array(game.board.size).fill(null));
            game.selectedBall = null;
            view.render(game.board, null);
        }
    };
}
