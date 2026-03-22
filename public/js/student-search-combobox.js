/**
 * Combobox de búsqueda de alumnos (panel personalizado, sin <datalist>).
 * window.initStudentSearchCombobox({ input, getAlumnos, onSelect, onClear })
 */
(function (global) {
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function highlightText(text, query) {
        const t = String(text);
        const q = query.trim();
        if (!q) return escapeHtml(t);
        const lower = t.toLowerCase();
        const qLower = q.toLowerCase();
        const idx = lower.indexOf(qLower);
        if (idx === -1) return escapeHtml(t);
        return (
            escapeHtml(t.slice(0, idx)) +
            '<mark class="bg-transparent font-semibold" style="color:#B20000">' +
            escapeHtml(t.slice(idx, idx + q.length)) +
            '</mark>' +
            escapeHtml(t.slice(idx + q.length))
        );
    }

    function filterAlumnos(alumnos, query) {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return alumnos.filter((a) => {
            const name = (a.NombreCompleto || '').toLowerCase();
            const cuenta = String(a.NumeroCuenta || '');
            return name.includes(q) || cuenta.toLowerCase().includes(q);
        }).slice(0, 100);
    }

    function initStudentSearchCombobox(config) {
        const input = config.input;
        const getAlumnos = config.getAlumnos;
        const onSelect = config.onSelect;
        const onClear = typeof config.onClear === 'function' ? config.onClear : function () {};

        if (!input || !getAlumnos || !onSelect) {
            return { destroy: function () {} };
        }

        const wrap = input.closest('.student-search-wrap');
        if (!wrap) {
            return { destroy: function () {} };
        }

        let panel = wrap.querySelector('[data-student-search-panel]');
        if (!panel) {
            panel = document.createElement('div');
            panel.setAttribute('data-student-search-panel', '');
            panel.setAttribute('role', 'listbox');
            panel.setAttribute('aria-label', 'Resultados de búsqueda');
            panel.className =
                'absolute left-0 right-0 top-full z-[200] mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 shadow-xl hidden';
            wrap.appendChild(panel);
        }

        let results = [];
        let activeIndex = -1;

        function closePanel() {
            panel.classList.add('hidden');
            activeIndex = -1;
        }

        function openPanel() {
            panel.classList.remove('hidden');
        }

        function updateActiveHighlight() {
            const opts = panel.querySelectorAll('[data-student-search-option]');
            opts.forEach((o, i) => {
                if (i === activeIndex) {
                    o.classList.add('bg-slate-700');
                    o.scrollIntoView({ block: 'nearest' });
                } else {
                    o.classList.remove('bg-slate-700');
                }
            });
        }

        function pick(alumno) {
            if (!alumno) return;
            const label = `${alumno.NumeroCuenta} - ${alumno.NombreCompleto || ''}`;
            input.value = label;
            closePanel();
            onSelect(alumno);
        }

        function render(query) {
            const alumnos = getAlumnos() || [];
            if (!Array.isArray(alumnos) || alumnos.length === 0) {
                panel.innerHTML = '';
                closePanel();
                return;
            }

            const q = query.trim();
            results = filterAlumnos(alumnos, q);
            activeIndex = -1;

            if (results.length === 0) {
                panel.innerHTML =
                    '<div class="px-3 py-2 text-sm text-slate-400">Sin resultados</div>';
                openPanel();
                return;
            }

            const html = results
                .map((a, i) => {
                    const cuenta = String(a.NumeroCuenta);
                    const nombre = a.NombreCompleto || '';
                    const nameHl = highlightText(nombre, q);
                    const cuentaHl = highlightText(cuenta, q);
                    return (
                        '<button type="button" role="option" data-student-search-option data-idx="' +
                        i +
                        '" class="flex w-full items-start gap-3 border-b border-slate-700/50 px-3 py-2.5 text-left last:border-0 hover:bg-slate-700">' +
                        '<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-600 text-slate-200">' +
                        '<i class="fas fa-user text-sm"></i></span>' +
                        '<span class="min-w-0 flex-1">' +
                        '<span class="block text-sm font-medium leading-tight text-slate-100">' +
                        nameHl +
                        '</span>' +
                        '<span class="mt-0.5 block text-xs text-slate-400">' +
                        cuentaHl +
                        '</span>' +
                        '</span></button>'
                    );
                })
                .join('');

            panel.innerHTML = html;

            panel.querySelectorAll('[data-student-search-option]').forEach((btn) => {
                btn.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    const idx = parseInt(btn.getAttribute('data-idx'), 10);
                    if (!Number.isNaN(idx) && results[idx]) pick(results[idx]);
                });
            });

            openPanel();
        }

        function onInput() {
            const q = input.value;
            if (!q.trim()) {
                closePanel();
                onClear();
                return;
            }
            render(q);
        }

        function onInputFocus() {
            const q = input.value.trim();
            if (q) render(q);
        }

        function onDocClick(e) {
            if (!wrap.contains(e.target)) closePanel();
        }

        function onKeydown(e) {
            const hidden = panel.classList.contains('hidden');
            const q = input.value.trim();

            if (hidden) {
                if ((e.key === 'ArrowDown' || e.key === 'Enter') && q) {
                    e.preventDefault();
                    render(q);
                    activeIndex = 0;
                    setTimeout(updateActiveHighlight, 0);
                }
                return;
            }

            const opts = panel.querySelectorAll('[data-student-search-option]');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (opts.length === 0) return;
                activeIndex = activeIndex < 0 ? 0 : Math.min(activeIndex + 1, opts.length - 1);
                updateActiveHighlight();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (opts.length === 0) return;
                activeIndex = activeIndex <= 0 ? 0 : activeIndex - 1;
                updateActiveHighlight();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIndex >= 0 && results[activeIndex]) {
                    pick(results[activeIndex]);
                } else if (results.length > 0) {
                    pick(results[0]);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closePanel();
            }
        }

        input.setAttribute('autocomplete', 'off');
        input.addEventListener('input', onInput);
        input.addEventListener('focus', onInputFocus);
        input.addEventListener('keydown', onKeydown);
        document.addEventListener('click', onDocClick);

        return {
            destroy: function () {
                input.removeEventListener('input', onInput);
                input.removeEventListener('focus', onInputFocus);
                input.removeEventListener('keydown', onKeydown);
                document.removeEventListener('click', onDocClick);
                closePanel();
            },
        };
    }

    global.initStudentSearchCombobox = initStudentSearchCombobox;
})(typeof window !== 'undefined' ? window : this);
