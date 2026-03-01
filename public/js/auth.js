// Utilizamos la versión modular de Firebase 11 a través de ESM
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";

// TODO: DEUDA TÉCNICA - [Credenciales Publicas] Las variables de Firebase config deben venir del enviroment y en builds CI/CD inyectarse.
const firebaseConfig = {
    // Aquí la configuración proporcionada por el Firebase MCP. Se rellena idealmente tras setup.
    apiKey: "API_KEY_AQUI",
    authDomain: "PROJECT_ID.firebaseapp.com",
    projectId: "PROJECT_ID",
    storageBucket: "PROJECT_ID.appspot.com",
    messagingSenderId: "MESSAGING_ID",
    appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// DOM Elements
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const uploadForm = document.getElementById('upload-form');

// Auth State Monitor
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Session Active
        loginContainer.classList.add('hidden');
        dashboardContainer.classList.remove('hidden');
    } else {
        // Logged Out
        loginContainer.classList.remove('hidden');
        dashboardContainer.classList.add('hidden');
    }
});

// Implement Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email-address').value;
    const password = document.getElementById('password').value;

    try {
        errorMessage.classList.add('hidden');
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("Logged in:", userCredential.user.email);
    } catch (error) {
        console.error("Login failed:", error.message);
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = error.message;
    }
});

// Implement file upload logic (MVP integration client-side to /api/ingest)
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('excel-file');
    const responseDiv = document.getElementById('upload-response');

    if (!fileInput.files || fileInput.files.length === 0) {
        responseDiv.textContent = 'Por favor selecciona un archivo';
        responseDiv.className = 'mt-4 text-sm font-medium text-ceutec-red';
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('archivo', file);

    try {
        responseDiv.textContent = 'Procesando...';
        responseDiv.className = 'mt-4 text-sm font-medium text-gray-600';

        const response = await fetch('/api/ingest/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            responseDiv.textContent = `Éxito: ${data.message} (${data.recordsProcessed} registros)`;
            responseDiv.className = 'mt-4 text-sm font-medium text-green-600';
        } else {
            throw new Error(data.error || 'Error del servidor');
        }
    } catch (error) {
        console.error("Upload error:", error);
        responseDiv.textContent = `Error: ${error.message}`;
        responseDiv.className = 'mt-4 text-sm font-medium text-ceutec-red';
    }
});
