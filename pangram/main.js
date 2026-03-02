'use strict';

// ═══════════════════════════════════════════════════════════════════
// Letter Bitmask Utilities
// ═══════════════════════════════════════════════════════════════════

const ALL_LETTERS = (1 << 26) - 1;

function letterBit(ch) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return 1 << (c - 65);
    if (c >= 97 && c <= 122) return 1 << (c - 97);
    return 0;
}

function textBits(text) {
    let bits = 0;
    for (let i = 0; i < text.length; i++) bits |= letterBit(text[i]);
    return bits;
}

function popcount(n) {
    let c = 0;
    while (n) { n &= n - 1; c++; }
    return c;
}

function missingLetters(covered) {
    const out = [];
    for (let i = 0; i < 26; i++) {
        if (!(covered & (1 << i))) out.push(String.fromCharCode(97 + i));
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════
// LLM Backends
// ═══════════════════════════════════════════════════════════════════

class BrowserLLM {
    constructor() {
        this.engine = null;
    }

    async load(modelId, onProgress) {
        const webllm = await import('https://esm.run/@mlc-ai/web-llm');
        this.engine = await webllm.CreateMLCEngine(modelId, {
            initProgressCallback: (info) => {
                onProgress(info.text, info.progress);
            },
        });
    }

    async complete(messages, temperature) {
        const result = await this.engine.chat.completions.create({
            messages,
            temperature,
            max_tokens: 200,
        });
        return result.choices[0].message.content.trim();
    }
}

class APILLM {
    constructor(url, key, model) {
        this.url = url;
        this.key = key;
        this.model = model;
    }

    async complete(messages, temperature) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.key) headers['Authorization'] = `Bearer ${this.key}`;

        const res = await fetch(this.url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: this.model,
                messages,
                temperature,
                max_tokens: 200,
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }

        const data = await res.json();
        return data.choices[0].message.content.trim();
    }
}

// ═══════════════════════════════════════════════════════════════════
// Response Parsing
// ═══════════════════════════════════════════════════════════════════

function parseWords(text) {
    return text
        .split(/[\n,;]+/)
        .map(line => {
            let w = line.trim()
                .replace(/^\d+[\.\):\-]\s*/, '')
                .replace(/^[\-\*\u2022]\s*/, '')
                .replace(/["'`\*\(\)]/g, '')
                .split(/\s+/)[0]
                ?.toLowerCase()
                .replace(/[^a-z]/g, '');
            return w || '';
        })
        .filter(w => w.length > 0 && w.length <= 25);
}

// ═══════════════════════════════════════════════════════════════════
// DFS Pangram Search
// ═══════════════════════════════════════════════════════════════════

class PangramSearch {
    constructor(llm, config, ui) {
        this.llm = llm;
        this.config = config;
        this.ui = ui;
        this.bestPangram = null;
        this.bestLength = Infinity;
        this.running = false;
        this.stats = { nodes: 0, apiCalls: 0, pangrams: 0, cacheHits: 0 };
        this.cache = new Map();
        this.startTime = 0;
    }

    stop() { this.running = false; }

    async start() {
        this.running = true;
        this.startTime = Date.now();
        this.stats = { nodes: 0, apiCalls: 0, pangrams: 0, cacheHits: 0 };
        this.cache.clear();
        this.bestPangram = null;
        this.bestLength = Infinity;

        this.ui.clearTree();
        this.ui.log('Starting DFS pangram search...', 'info');

        try {
            const starters = await this.fetchWords([], 0);
            this.ui.log(`Root candidates: ${starters.join(', ')}`, 'info');

            for (const word of starters) {
                if (!this.running) break;
                const bits = textBits(word);
                const node = this.ui.addTreeNode(null, word, bits, popcount(bits));
                await this.dfs([word], bits, 0, node);
                this.ui.markNode(node, node._finalStatus || 'explored');
            }
        } catch (err) {
            this.ui.log(`Error: ${err.message}`, 'error');
        }

        this.running = false;
        if (this.bestPangram) {
            this.ui.log(`Search complete. Best: "${this.bestPangram}" (${this.bestLength} chars)`, 'pangram');
        } else {
            this.ui.log('Search complete. No pangram found.', 'info');
        }
        this.ui.onSearchDone();
    }

    async dfs(words, covered, depth, treeNode) {
        if (!this.running) return;

        this.stats.nodes++;
        const text = words.join(' ');

        // Update UI
        this.ui.updateCurrent(words, covered);
        this.ui.updateStats(this.stats, this.startTime);

        // Yield to UI thread periodically
        if (this.stats.nodes % 3 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }

        // ── Pangram check ──

        if (covered === ALL_LETTERS) {
            this.bestPangram = text;
            this.bestLength = text.length;
            this.stats.pangrams++;
            treeNode._finalStatus = 'pangram';
            this.ui.markNode(treeNode, 'pangram');
            this.ui.updateBest(text);
            this.ui.log(`Found pangram (${text.length} chars): "${text}"`, 'pangram');
            return;
        }

        // ── Pruning ──

        if (text.length >= this.bestLength) {
            treeNode._finalStatus = 'pruned';
            this.ui.markNode(treeNode, 'pruned');
            return;
        }

        if (depth >= this.config.maxDepth) {
            treeNode._finalStatus = 'pruned';
            this.ui.markNode(treeNode, 'pruned');
            return;
        }

        // Optimistic lower bound: each missing letter needs at least 1 char,
        // plus at least 1 space to introduce a new word
        const missing = 26 - popcount(covered);
        if (text.length + missing >= this.bestLength) {
            treeNode._finalStatus = 'pruned';
            this.ui.markNode(treeNode, 'pruned');
            return;
        }

        // ── Get candidates from LLM ──

        let candidates;
        try {
            candidates = await this.fetchWords(words, covered);
        } catch (err) {
            this.ui.log(`LLM error at depth ${depth}: ${err.message}`, 'error');
            treeNode._finalStatus = 'error';
            this.ui.markNode(treeNode, 'error');
            return;
        }

        if (candidates.length === 0) {
            treeNode._finalStatus = 'dead-end';
            this.ui.markNode(treeNode, 'dead-end');
            return;
        }

        // Sort: more new letters first, then shorter words
        candidates.sort((a, b) => {
            const aNew = popcount(textBits(a) & ~covered);
            const bNew = popcount(textBits(b) & ~covered);
            if (bNew !== aNew) return bNew - aNew;
            return a.length - b.length;
        });

        // Deduplicate
        const seen = new Set();
        const unique = candidates.filter(w => {
            if (seen.has(w)) return false;
            seen.add(w);
            return true;
        });

        this.ui.markNode(treeNode, 'active');

        for (const word of unique) {
            if (!this.running) break;
            const newCovered = covered | textBits(word);
            const newLetters = popcount(newCovered) - popcount(covered);
            const childNode = this.ui.addTreeNode(treeNode, word, newCovered, newLetters);
            await this.dfs([...words, word], newCovered, depth + 1, childNode);
            this.ui.markNode(childNode, childNode._finalStatus || 'explored');
        }

        treeNode._finalStatus = 'explored';
        this.ui.markNode(treeNode, 'explored');
    }

    async fetchWords(words, covered) {
        const missing = missingLetters(covered);
        const cacheKey = words.join(' ') + '|' + missing.join('');

        if (this.cache.has(cacheKey)) {
            this.stats.cacheHits++;
            return [...this.cache.get(cacheKey)];
        }

        this.stats.apiCalls++;
        this.ui.updateStats(this.stats, this.startTime);

        const n = this.config.branching;
        let messages;

        if (words.length === 0) {
            messages = [
                {
                    role: 'system',
                    content: [
                        `List exactly ${n} single English words to begin a very short pangram`,
                        '(a sentence using all 26 letters of the alphabet).',
                        'Prefer short words that contain rare letters like j, k, q, v, x, z.',
                        'Output ONLY the words, one per line. No numbering or explanation.',
                    ].join(' '),
                },
                { role: 'user', content: `List ${n} starting words:` },
            ];
        } else {
            messages = [
                {
                    role: 'system',
                    content: [
                        `You are building the shortest possible pangram (a sentence using every letter a-z at least once).`,
                        `Suggest exactly ${n} single English words to continue the sentence below.`,
                        `Each word MUST be a real, common English word. Prefer short words that contain`,
                        `these missing letters: ${missing.join(', ')}.`,
                        'The sentence should read as natural English.',
                        'Output ONLY the words, one per line. No numbering or explanation.',
                    ].join(' '),
                },
                {
                    role: 'user',
                    content: `Sentence so far: "${words.join(' ')}"\nMissing letters: ${missing.join(', ')}\n\nList ${n} next words:`,
                },
            ];
        }

        const response = await this.llm.complete(messages, this.config.temperature);
        const result = parseWords(response).slice(0, n);

        this.cache.set(cacheKey, [...result]);
        return result;
    }
}

// ═══════════════════════════════════════════════════════════════════
// UI Controller
// ═══════════════════════════════════════════════════════════════════

class UI {
    constructor() {
        this.treeEl = document.getElementById('tree');
        this.logEl = document.getElementById('log');
        this.letterEls = [];
        this.activeTab = 'browser';
        this.browserLLM = new BrowserLLM();
        this.modelLoaded = false;
        this.search = null;

        this.initAlphabet();
        this.initTabs();
        this.initPresets();
        this.initButtons();
        this.loadSettings();
        this.checkWebGPU();
    }

    // ── Alphabet ──

    initAlphabet() {
        const el = document.getElementById('alphabet');
        for (let i = 0; i < 26; i++) {
            const box = document.createElement('div');
            box.className = 'letter-box';
            box.textContent = String.fromCharCode(65 + i);
            el.appendChild(box);
            this.letterEls.push(box);
        }
    }

    updateAlphabet(covered) {
        for (let i = 0; i < 26; i++) {
            this.letterEls[i].className =
                'letter-box' + ((covered & (1 << i)) ? ' covered' : '');
        }
    }

    // ── Tabs ──

    initTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
                this.activeTab = tab.dataset.tab;
            });
        });
    }

    // ── Presets ──

    initPresets() {
        const presets = {
            openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
            groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant' },
            together: { url: 'https://api.together.xyz/v1/chat/completions', model: 'meta-llama/Llama-3-8b-chat-hf' },
        };

        document.getElementById('api-preset').addEventListener('change', (e) => {
            const p = presets[e.target.value];
            if (p) {
                document.getElementById('api-url').value = p.url;
                document.getElementById('api-model').value = p.model;
            }
        });
    }

    // ── WebGPU check ──

    checkWebGPU() {
        if (!navigator.gpu) {
            document.getElementById('webgpu-warning').style.display = 'block';
            document.getElementById('load-model-btn').disabled = true;
        }
    }

    // ── Buttons ──

    initButtons() {
        const loadBtn = document.getElementById('load-model-btn');
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');

        loadBtn.addEventListener('click', async () => {
            const modelId = document.getElementById('browser-model').value;
            loadBtn.disabled = true;
            loadBtn.textContent = 'Loading...';

            const progressBar = document.getElementById('load-progress');
            const progressFill = document.getElementById('load-progress-fill');
            const progressText = document.getElementById('load-progress-text');
            progressBar.classList.add('active');
            progressText.classList.add('active');

            try {
                await this.browserLLM.load(modelId, (text, progress) => {
                    progressFill.style.width = ((progress || 0) * 100) + '%';
                    progressText.textContent = text;
                });

                this.modelLoaded = true;
                loadBtn.textContent = 'Loaded';
                progressText.textContent = 'Ready';
                this.log('Model loaded successfully', 'info');
            } catch (err) {
                loadBtn.textContent = 'Load Failed - Retry';
                loadBtn.disabled = false;
                progressText.textContent = `Error: ${err.message}`;
                this.log(`Model load error: ${err.message}`, 'error');
            }
        });

        startBtn.addEventListener('click', async () => {
            let llm;

            if (this.activeTab === 'browser') {
                if (!this.modelLoaded) {
                    this.log('Load a model first (click "Load Model")', 'error');
                    return;
                }
                llm = this.browserLLM;
            } else {
                const url = document.getElementById('api-url').value.trim();
                const key = document.getElementById('api-key').value.trim();
                const model = document.getElementById('api-model').value.trim();
                if (!url || !model) {
                    this.log('Fill in API endpoint and model name', 'error');
                    return;
                }
                llm = new APILLM(url, key, model);
            }

            this.saveSettings();

            const config = {
                branching: parseInt(document.getElementById('branching').value) || 5,
                maxDepth: parseInt(document.getElementById('max-depth').value) || 12,
                temperature: parseFloat(document.getElementById('temperature').value) || 1.0,
            };

            startBtn.disabled = true;
            stopBtn.disabled = false;

            this.search = new PangramSearch(llm, config, this);
            await this.search.start();
        });

        stopBtn.addEventListener('click', () => {
            if (this.search) this.search.stop();
        });
    }

    onSearchDone() {
        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
    }

    // ── Settings ──

    saveSettings() {
        try {
            const s = {
                tab: this.activeTab,
                apiUrl: document.getElementById('api-url').value,
                apiModel: document.getElementById('api-model').value,
                browserModel: document.getElementById('browser-model').value,
                branching: document.getElementById('branching').value,
                maxDepth: document.getElementById('max-depth').value,
                temperature: document.getElementById('temperature').value,
            };
            localStorage.setItem('pangram-settings', JSON.stringify(s));
        } catch {}
    }

    loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem('pangram-settings'));
            if (!s) return;
            if (s.apiUrl) document.getElementById('api-url').value = s.apiUrl;
            if (s.apiModel) document.getElementById('api-model').value = s.apiModel;
            if (s.browserModel) document.getElementById('browser-model').value = s.browserModel;
            if (s.branching) document.getElementById('branching').value = s.branching;
            if (s.maxDepth) document.getElementById('max-depth').value = s.maxDepth;
            if (s.temperature) document.getElementById('temperature').value = s.temperature;
            if (s.tab) document.querySelector(`.tab[data-tab="${s.tab}"]`)?.click();
        } catch {}
    }

    // ── Current path display ──

    updateCurrent(words, covered) {
        const el = document.getElementById('current-sentence');
        el.textContent = words.join(' ') || 'Exploring...';
        el.classList.remove('no-result');

        const miss = missingLetters(covered);
        document.getElementById('current-meta').textContent =
            miss.length > 0
                ? `${popcount(covered)}/26 letters \u00b7 Missing: ${miss.join(' ')}`
                : '26/26 letters \u00b7 Complete!';

        this.updateAlphabet(covered);
    }

    // ── Best result display ──

    updateBest(text) {
        const el = document.getElementById('best-sentence');
        el.textContent = `"${text}"`;
        el.classList.remove('no-result');
        document.getElementById('best-meta').textContent =
            `${text.length} characters \u00b7 ${text.split(' ').length} words`;
    }

    // ── Stats ──

    updateStats(stats, startTime) {
        document.getElementById('stat-nodes').textContent = stats.nodes;
        document.getElementById('stat-api').textContent = stats.apiCalls;
        document.getElementById('stat-cache').textContent = stats.cacheHits;
        document.getElementById('stat-pangrams').textContent = stats.pangrams;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        document.getElementById('stat-time').textContent = elapsed + 's';
    }

    // ── Tree visualization ──

    clearTree() {
        this.treeEl.innerHTML = '';
    }

    addTreeNode(parent, word, covered, newLetterCount) {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'tree-node active';

        const label = document.createElement('div');
        label.className = 'tree-label';

        const wordSpan = document.createElement('span');
        wordSpan.className = 'tree-word';
        wordSpan.textContent = word;

        const infoSpan = document.createElement('span');
        infoSpan.className = 'tree-info';
        infoSpan.textContent = `${popcount(covered)}/26`;

        label.appendChild(wordSpan);
        label.appendChild(infoSpan);

        if (newLetterCount > 0) {
            const newSpan = document.createElement('span');
            newSpan.className = 'tree-new';
            newSpan.textContent = `+${newLetterCount}`;
            label.appendChild(newSpan);
        }

        nodeEl.appendChild(label);

        const childrenEl = document.createElement('div');
        childrenEl.className = 'tree-children';
        nodeEl.appendChild(childrenEl);

        const node = { el: nodeEl, childrenEl, word, _covered: covered };

        if (parent) {
            parent.childrenEl.appendChild(nodeEl);
        } else {
            this.treeEl.appendChild(nodeEl);
        }

        // Auto-scroll to latest
        this.treeEl.scrollTop = this.treeEl.scrollHeight;

        return node;
    }

    markNode(node, status) {
        if (!node) return;
        node._finalStatus = status;
        node.el.className = `tree-node ${status}`;
    }

    // ── Log ──

    log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = message;
        this.logEl.appendChild(entry);
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }
}

// ═══════════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════════

const ui = new UI();
