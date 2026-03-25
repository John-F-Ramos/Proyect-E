(function () {
    const usersTbody = document.getElementById('adminUsersTableBody');
    const auditTbody = document.getElementById('adminAuditTableBody');
    const searchInput = document.getElementById('adminSearchInput');
    const roleFilter = document.getElementById('adminRoleFilter');
    const statusFilter = document.getElementById('adminStatusFilter');
    const btnRefresh = document.getElementById('btnRefreshAdminData');
    const feedback = document.getElementById('adminFeedback');

    let allUsers = [];

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showFeedback(message, type) {
        if (!feedback) return;
        feedback.textContent = message;
        feedback.classList.remove('hidden', 'bg-green-50', 'text-green-700', 'border', 'border-green-200', 'bg-red-50', 'text-red-700', 'border-red-200');
        feedback.classList.add('border');
        if (type === 'success') {
            feedback.classList.add('bg-green-50', 'text-green-700', 'border-green-200');
        } else {
            feedback.classList.add('bg-red-50', 'text-red-700', 'border-red-200');
        }
    }

    function formatDate(value) {
        if (!value) return '-';
        // Si viene como "YYYY-MM-DD HH:mm:ss" desde SQL, evitar Date() para no desplazar timezone.
        if (typeof value === 'string') {
            const match = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
            if (match) {
                const [, y, m, d, hh, mm, ss] = match;
                return `${d}/${m}/${y}, ${hh}:${mm}:${ss}`;
            }
        }
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return '-';
        return dt.toLocaleString('es-HN', {
            timeZone: 'America/Tegucigalpa',
            hour12: true
        });
    }

    function roleSelectOptions(currentRole) {
        const roles = [
            { id: 1, label: 'Administrador' },
            { id: 2, label: 'Jefe de Carrera' },
            { id: 3, label: 'Estudiante' }
        ];
        return roles
            .map((r) => `<option value="${r.id}" ${Number(currentRole) === r.id ? 'selected' : ''}>${r.label}</option>`)
            .join('');
    }

    function filteredUsers() {
        const q = (searchInput?.value || '').trim().toLowerCase();
        const selectedRole = roleFilter?.value || '';
        const selectedStatus = statusFilter?.value || '';

        return allUsers.filter((u) => {
            const matchText = !q ||
                String(u.nombre || '').toLowerCase().includes(q) ||
                String(u.correoInstitucional || '').toLowerCase().includes(q) ||
                String(u.numeroCuenta || '').toLowerCase().includes(q);

            const matchRole = !selectedRole || String(u.rol) === selectedRole;
            const matchStatus =
                !selectedStatus ||
                (selectedStatus === 'active' && u.activo) ||
                (selectedStatus === 'inactive' && !u.activo);

            return matchText && matchRole && matchStatus;
        });
    }

    function renderUsers() {
        if (!usersTbody) return;
        const rows = filteredUsers();
        if (rows.length === 0) {
            usersTbody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-slate-400 italic">No hay usuarios para mostrar.</td></tr>';
            return;
        }

        usersTbody.innerHTML = rows.map((u) => `
            <tr>
                <td class="px-4 py-3">
                    <p class="font-semibold text-slate-800">${escapeHtml(u.nombre)}</p>
                    <p class="text-xs text-slate-500">${escapeHtml(u.correoInstitucional)}</p>
                </td>
                <td class="px-4 py-3">${escapeHtml(u.numeroCuenta || '-')}</td>
                <td class="px-4 py-3">
                    <select data-role-select="${u.id}" class="border border-gray-300 rounded-lg p-2 text-sm">
                        ${roleSelectOptions(u.rol)}
                    </select>
                </td>
                <td class="px-4 py-3">
                    <label class="inline-flex items-center gap-2">
                        <input data-status-toggle="${u.id}" type="checkbox" class="h-4 w-4" ${u.activo ? 'checked' : ''}>
                        <span class="${u.activo ? 'text-green-700' : 'text-slate-500'} text-sm">${u.activo ? 'Activo' : 'Inactivo'}</span>
                    </label>
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                        <button data-save-role="${u.id}" class="bg-white border border-blue-300 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-50">
                            Guardar rol
                        </button>
                        <button data-save-status="${u.id}" class="bg-white border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-amber-50">
                            Guardar estado
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function auditChangeText(row) {
        const roleChanged = row.rolAnterior !== row.rolNuevo;
        const statusChanged = row.estadoAnterior !== row.estadoNuevo;
        const parts = [];
        if (roleChanged) {
            parts.push(`Rol: ${row.rolAnteriorNombre || '-'} -> ${row.rolNuevoNombre || '-'}`);
        }
        if (statusChanged) {
            parts.push(`Estado: ${row.estadoAnterior ? 'Activo' : 'Inactivo'} -> ${row.estadoNuevo ? 'Activo' : 'Inactivo'}`);
        }
        if (parts.length === 0) return 'Sin cambio detectable';
        return parts.join(' | ');
    }

    function renderAudit(rows) {
        if (!auditTbody) return;
        if (!Array.isArray(rows) || rows.length === 0) {
            auditTbody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-slate-400 italic">No hay auditoría registrada.</td></tr>';
            return;
        }

        auditTbody.innerHTML = rows.map((r) => `
            <tr>
                <td class="px-4 py-3">${escapeHtml(formatDate(r.fechaTexto || r.fecha))}</td>
                <td class="px-4 py-3">${escapeHtml(r.nombreAdminActor || '-')}</td>
                <td class="px-4 py-3">${escapeHtml(r.nombreUsuarioObjetivo || '-')}</td>
                <td class="px-4 py-3">${escapeHtml(auditChangeText(r))}</td>
                <td class="px-4 py-3">${escapeHtml(r.ipOrigen || '-')}</td>
            </tr>
        `).join('');
    }

    async function loadUsers() {
        const res = await fetch('/api/admin/users');
        if (res.status === 403) {
            window.location.href = '/dashboard';
            return;
        }
        if (!res.ok) throw new Error('No se pudieron cargar los usuarios.');
        allUsers = await res.json();
        renderUsers();
    }

    async function loadAudit() {
        const res = await fetch('/api/admin/audit/roles?limit=25');
        if (!res.ok) throw new Error('No se pudo cargar la auditoría.');
        const rows = await res.json();
        renderAudit(rows);
    }

    async function saveRole(userId) {
        const select = document.querySelector(`[data-role-select="${userId}"]`);
        if (!select) return;
        const idRol = Number(select.value);
        const motivo = window.prompt('Motivo del cambio de rol (opcional):', '') || '';
        const res = await fetch(`/api/admin/users/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idRol, motivo })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(payload.error || payload.message || 'No se pudo actualizar el rol.');
        }
        showFeedback(payload.message || 'Rol actualizado correctamente.', 'success');
        await Promise.all([loadUsers(), loadAudit()]);
    }

    async function saveStatus(userId) {
        const toggle = document.querySelector(`[data-status-toggle="${userId}"]`);
        if (!toggle) return;
        const activo = Boolean(toggle.checked);
        const motivo = window.prompt('Motivo del cambio de estado (opcional):', '') || '';
        const res = await fetch(`/api/admin/users/${userId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo, motivo })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(payload.error || payload.message || 'No se pudo actualizar el estado.');
        }
        showFeedback(payload.message || 'Estado actualizado correctamente.', 'success');
        await Promise.all([loadUsers(), loadAudit()]);
    }

    if (usersTbody) {
        usersTbody.addEventListener('click', async (event) => {
            const roleBtn = event.target.closest('[data-save-role]');
            const statusBtn = event.target.closest('[data-save-status]');
            if (!roleBtn && !statusBtn) return;

            try {
                if (roleBtn) {
                    const id = Number(roleBtn.getAttribute('data-save-role'));
                    await saveRole(id);
                }
                if (statusBtn) {
                    const id = Number(statusBtn.getAttribute('data-save-status'));
                    await saveStatus(id);
                }
            } catch (error) {
                showFeedback(error.message || 'No se pudo completar la operación.', 'error');
                await loadUsers();
            }
        });
    }

    [searchInput, roleFilter, statusFilter].forEach((el) => {
        if (!el) return;
        el.addEventListener('input', renderUsers);
        el.addEventListener('change', renderUsers);
    });

    if (btnRefresh) {
        btnRefresh.addEventListener('click', async () => {
            try {
                await Promise.all([loadUsers(), loadAudit()]);
                showFeedback('Datos recargados.', 'success');
            } catch (error) {
                showFeedback(error.message || 'No se pudo recargar.', 'error');
            }
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await Promise.all([loadUsers(), loadAudit()]);
        } catch (error) {
            showFeedback(error.message || 'No se pudo cargar administración.', 'error');
        }
    });
})();
