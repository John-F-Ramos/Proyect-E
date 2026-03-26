// public/js/auth-guard.js
(function() {
    function getStoredUser() {
        try {
            const raw = localStorage.getItem('user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            localStorage.removeItem('user');
            return null;
        }
    }

    const user = getStoredUser();
    
    // Si no hay usuario, redirigir al login
    if (!user) {
        window.location.href = '/';
        return;
    }

    // Adjuntar token a llamadas /api automáticamente.
    const token = user.token || null;
    if (token && typeof window.fetch === 'function') {
        const originalFetch = window.fetch.bind(window);
        window.fetch = (input, init = {}) => {
            try {
                const url = typeof input === 'string' ? input : (input && input.url) || '';
                const isApiCall = url.startsWith('/api/');
                if (!isApiCall) {
                    return originalFetch(input, init);
                }

                const headers = new Headers(init.headers || (input && input.headers) || {});
                if (!headers.has('Authorization')) {
                    headers.set('Authorization', `Bearer ${token}`);
                }

                return originalFetch(input, { ...init, headers });
            } catch (e) {
                return originalFetch(input, init);
            }
        };
    }

    const currentPath = window.location.pathname;
    
    // Asumiendo que: 1 = Admin Full, 2 = Jefe de Carrera, 3 = Estudiante
    const isAdmin = user.rol === 1;
    const isStudent = user.rol === 3; 

    // Restricción explícita para módulo de administración.
    if (!isAdmin && currentPath.includes('/administracion')) {
        window.location.href = '/dashboard';
        return;
    }

    // Restricciones de rutas para estudiantes (Reportes permitido; Catálogos Académicos no)
    if (isStudent && currentPath.includes('/plan-estudio')) {
        window.location.href = '/dashboard';
        return;
    }

    // Ocultar elementos de navegación después de que el DOM cargue
    document.addEventListener('DOMContentLoaded', () => {
        const adminOnlyElements = document.querySelectorAll('[data-admin-only="true"]');
        adminOnlyElements.forEach((el) => {
            if (isAdmin) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        const noAdminElements = document.querySelectorAll('[data-no-admin="true"]');
        noAdminElements.forEach((el) => {
            if (isAdmin) {
                el.classList.add('hidden');
            } else {
                el.classList.remove('hidden');
            }
        });

        const studentOnlyElements = document.querySelectorAll('[data-student-only="true"]');
        studentOnlyElements.forEach((el) => {
            if (isStudent) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        if (isStudent) {
            const navElements = document.querySelectorAll('a[href="/plan-estudio"]');
            navElements.forEach(el => el.style.display = 'none');
            
            // También ocultar elementos específicos como el buscador de alumnos en el dashboard si es estudiante
            const alumnoInput = document.getElementById('alumnoInput');
            if (alumnoInput) alumnoInput.style.display = 'none';
        }
    });
})();
