// Bindeamos el formulario
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const errorText = document.querySelector('.error-text');
const btnGoRegister = document.getElementById('btnGoRegister');

if (btnGoRegister) {
    btnGoRegister.addEventListener('click', () => {
        window.location.href = '/registro';
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Ocultamos error previo si existe
        if(errorMessage) errorMessage.classList.add('hidden');
        
        // Obtenemos valores
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        // Validación básica
        if (!email || !password) {
            UI.showError("Por favor, completa todos los campos.", 'warning');
            return;
        }

        // Mostrar estado de carga
        UI.setButtonLoading(true);

        try {
            console.log("Intentando login...");
            
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error en el inicio de sesión');
            }
            
            console.log("¡Éxito! Logueado como:", data.user.nombre);
            console.log("Número de cuenta:", data.user.numeroCuenta); // Debug
            
            // Guardar info del usuario si es necesario
            const userPayload = {
                ...data.user,
                token: data.token
            };
            localStorage.setItem('user', JSON.stringify(userPayload));

            // Redirección al Dashboard
            UI.showLoginSuccess();
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 500);

        } catch (error) {
            console.error("Error de login:", error.message);
            
            UI.setButtonLoading(false);
            UI.showError(error.message, 'error');
        }
    });
}