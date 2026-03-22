// public/js/auth-guard.js
(function() {
    const user = JSON.parse(localStorage.getItem('user'));
    
    // Si no hay usuario, redirigir al login
    if (!user) {
        window.location.href = '/';
        return;
    }

    const currentPath = window.location.pathname;
    
    // Asumiendo que: 1 = Admin Full, 2 = Jefe de Carrera, 3 = Estudiante
    const isStudent = user.rol === 3; 

    // Restricciones de rutas para estudiantes (Reportes permitido; Catálogos Académicos no)
    if (isStudent && currentPath.includes('/plan-estudio')) {
        window.location.href = '/dashboard';
        return;
    }

    // Ocultar elementos de navegación después de que el DOM cargue
    document.addEventListener('DOMContentLoaded', () => {
        if (isStudent) {
            const navElements = document.querySelectorAll('a[href="/plan-estudio"]');
            navElements.forEach(el => el.style.display = 'none');
            
            // También ocultar elementos específicos como el buscador de alumnos en el dashboard si es estudiante
            const alumnoInput = document.getElementById('alumnoInput');
            if (alumnoInput) alumnoInput.style.display = 'none';
        }
    });
})();
