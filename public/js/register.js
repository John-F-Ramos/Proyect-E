(function () {
    const form = document.getElementById('register-form');
    const messageBox = document.getElementById('register-message');
    const btnRegister = document.getElementById('btnRegister');

    function showMessage(text, type) {
        if (!messageBox) return;
        messageBox.textContent = text;
        messageBox.classList.remove('hidden', 'bg-red-50', 'border-red-200', 'text-red-700', 'bg-green-50', 'border-green-200', 'text-green-700', 'border');
        messageBox.classList.add('border');
        if (type === 'success') {
            messageBox.classList.add('bg-green-50', 'border-green-200', 'text-green-700');
        } else {
            messageBox.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
        }
    }

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = document.getElementById('regNombre')?.value?.trim() || '';
        const email = document.getElementById('regEmail')?.value?.trim() || '';
        const numeroCuenta = document.getElementById('regCuenta')?.value?.trim() || '';
        const password = document.getElementById('regPassword')?.value || '';
        const confirmPassword = document.getElementById('regConfirmPassword')?.value || '';

        if (!nombre || !email || !numeroCuenta || !password || !confirmPassword) {
            showMessage('Completa todos los campos.', 'error');
            return;
        }
        if (!email.toLowerCase().endsWith('@unitec.edu')) {
            showMessage('El correo debe terminar en @unitec.edu.', 'error');
            return;
        }
        if (password.length < 8) {
            showMessage('La contraseña debe tener al menos 8 caracteres.', 'error');
            return;
        }
        if (password !== confirmPassword) {
            showMessage('Las contraseñas no coinciden.', 'error');
            return;
        }

        try {
            if (btnRegister) {
                btnRegister.disabled = true;
                btnRegister.textContent = 'Creando cuenta...';
            }

            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, email, numeroCuenta, password })
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.message || 'No se pudo completar el registro.');
            }

            showMessage(payload.message || 'Registro exitoso. Ya puedes iniciar sesión.', 'success');
            form.reset();

            setTimeout(() => {
                window.location.href = '/';
            }, 1200);
        } catch (error) {
            showMessage(error.message || 'No se pudo completar el registro.', 'error');
        } finally {
            if (btnRegister) {
                btnRegister.disabled = false;
                btnRegister.textContent = 'Crear cuenta';
            }
        }
    });
})();
