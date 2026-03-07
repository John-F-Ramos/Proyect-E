import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAaXon3_ya4yPl53KNmJZHzvnvhJmKaV_Q",
  authDomain: "proyecto-equivalencias-ceutec.firebaseapp.com",
  projectId: "proyecto-equivalencias-ceutec",
  storageBucket: "proyecto-equivalencias-ceutec.firebasestorage.app",
  messagingSenderId: "883247254921",
  appId: "1:883247254921:web:2195c8f4e7381a92f3a558"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Bindeamos el formulario
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const errorText = document.querySelector('.error-text');

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

        // Mostrar estado de carga usando UI.setButtonLoading
        UI.setButtonLoading(true);

        try {
            console.log("Intentando conectar con Firebase...");
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            
            console.log("¡Éxito! Logueado como:", userCredential.user.email);
            
            // Redirección al Dashboard - SOLO si es exitoso
            UI.showLoginSuccess();
            
            // Pequeño retraso para mostrar la animación antes de redirigir
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 500);

        } catch (error) {
            console.error("Error de login:", error.code);
            
            // Quitamos el estado de carga
            UI.setButtonLoading(false);
            
            // Mostrar mensaje de error específico según el código
            let mensajeError = "Error al iniciar sesión. Intenta nuevamente.";
            
            switch(error.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    mensajeError = "Credenciales incorrectas. Por favor, verifica tu correo y contraseña.";
                    break;
                case 'auth/too-many-requests':
                    mensajeError = "Demasiados intentos fallidos. Intenta más tarde.";
                    break;
                case 'auth/network-request-failed':
                    mensajeError = "Error de conexión. Verifica tu internet.";
                    break;
                case 'auth/invalid-email':
                    mensajeError = "El formato del correo no es válido.";
                    break;
            }
            
            UI.showError(mensajeError, 'error');
        }
    });
}