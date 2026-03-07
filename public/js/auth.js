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
        
        // Ahora sí coinciden con tu HTML (id="email" e id="password")
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            // Ocultamos error previo si existe
            if(errorMessage) errorMessage.classList.add('hidden');
            
            console.log("Intentando conectar con Firebase...");
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            
            console.log("¡Éxito! Logueado como:", userCredential.user.email);
            
            // Redirección al Dashboard
            window.location.href = '/dashboard';

        } catch (error) {
            console.error("Error de login:", error.code);
            
            // Mostramos el mensaje en tu cajita roja de error
            if(errorMessage) {
                errorMessage.classList.remove('hidden');
                if(errorText) {
                    errorText.textContent = "Credenciales incorrectas o usuario no registrado.";
                }
            }
        }
    });
}