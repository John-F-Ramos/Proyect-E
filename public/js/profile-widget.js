(function () {
    function getStoredUser() {
        try {
            const raw = localStorage.getItem('user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function roleName(rol) {
        if (rol === 1) return 'Administrador';
        if (rol === 2) return 'Jefe de Carrera';
        return 'Estudiante';
    }

    function initProfileWidget() {
        const profileDropdownBtn = document.getElementById('profileDropdownBtn');
        const profileDropdown = document.getElementById('profileDropdown');
        const dropdownUserName = document.getElementById('dropdownUserName');
        const dropdownUserRole = document.getElementById('dropdownUserRole');
        if (!profileDropdownBtn || !profileDropdown) return;

        const user = getStoredUser();
        if (dropdownUserName) dropdownUserName.textContent = user?.nombre || 'Usuario';
        if (dropdownUserRole) dropdownUserRole.textContent = user?.rolNombre || roleName(user?.rol);

        profileDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (
                !profileDropdown.classList.contains('hidden') &&
                !profileDropdown.contains(e.target) &&
                e.target !== profileDropdownBtn
            ) {
                profileDropdown.classList.add('hidden');
            }
        });
    }

    window.initProfileWidget = initProfileWidget;
    document.addEventListener('DOMContentLoaded', initProfileWidget);
})();
