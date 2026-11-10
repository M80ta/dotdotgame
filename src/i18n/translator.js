// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {LANGUAGE_KEY} from '../config.js';
import {MESSAGES} from './messages.js';

export class I18n {
    constructor({getStorage, language = 'zh-TW'} = {}) {
        this.getStorage = getStorage;
        this.language = Object.hasOwn(MESSAGES, language) ? language : 'zh-TW';
        try {
            const saved = getStorage?.().getItem(LANGUAGE_KEY);
            if (Object.hasOwn(MESSAGES, saved)) this.language = saved;
        } catch {
            // Language switching also works when browser storage is unavailable.
        }
    }

    setLanguage(language) {
        if (!Object.hasOwn(MESSAGES, language)) return false;
        this.language = language;
        try {
            this.getStorage?.().setItem(LANGUAGE_KEY, language);
        } catch {
            // Keep the user's choice for the current page even if it cannot be saved.
        }
        return true;
    }

    t(key, params = {}) {
        const template = MESSAGES[this.language][key];
        if (typeof template !== 'string') throw new Error(`Missing translation: ${key}`);
        return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
    }

    apply(document) {
        for (const [attribute, target] of [['data-i18n', null], ['data-i18n-aria-label', 'aria-label'], ['data-i18n-content', 'content']]) {
            for (const element of document.querySelectorAll(`[${attribute}]`)) {
                const text = this.t(element.getAttribute(attribute));
                if (target) element.setAttribute(target, text);
                else element.textContent = text;
            }
        }
        document.documentElement.lang = this.language;
        document.title = this.t('app.title');
    }
}
