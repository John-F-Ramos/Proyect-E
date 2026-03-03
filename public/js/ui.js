// UI Module - Versión mejorada con animaciones y micro-interacciones
const UI = (() => {
    // Estado
    let currentFile = null;
    let isLoading = false;
    
    // Elementos del DOM
    const elements = {
        loginContainer: document.getElementById('login-container'),
        dashboardContainer: document.getElementById('dashboard-container'),
        loginForm: document.getElementById('login-form'),
        uploadForm: document.getElementById('upload-form'),
        fileInput: document.getElementById('file-input'),
        fileInfo: document.getElementById('file-info'),
        fileName: document.getElementById('file-name'),
        fileSize: document.getElementById('file-size'),
        progressContainer: document.getElementById('progress-container'),
        progressBar: document.getElementById('progress-bar'),
        progressPercent: document.getElementById('progress-percent'),
        uploadResponse: document.getElementById('upload-response'),
        responseMessage: document.getElementById('response-message'),
        errorMessage: document.getElementById('error-message'),
        dropzone: document.getElementById('dropzone'),
        passwordToggle: document.querySelector('.toggle-password'),
        clearFileBtn: document.getElementById('clear-file'),
        processBtn: document.querySelector('button[type="submit"]'),
        emailInput: document.getElementById('email'),
        passwordInput: document.getElementById('password'),
        rememberCheckbox: document.getElementById('remember')
    };

    // Inicialización
    const init = () => {
        console.log('✨ UI Enhanced initialized');
        bindEvents();
        addMicroInteractions();
        initScrollAnimations();
        initFormValidation();
        loadRememberedUser();
        initParticles();
    };

    // Crear partículas decorativas
    const initParticles = () => {
        const container = document.querySelector('.particles-container');
        if (!container) return;
        
        for (let i = 0; i < 100; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.top = Math.random() * 100 + '%';
            particle.style.animationDuration = (Math.random() * 20 + 15) + 's';
            particle.style.animationDelay = Math.random() * 5 + 's';
            container.appendChild(particle);
        }
    };

    // Micro-interacciones adicionales
    const addMicroInteractions = () => {
        // Efecto ripple en botones
        document.querySelectorAll('.ceutec-btn, .ceutec-btn-secondary').forEach(btn => {
            btn.addEventListener('click', createRipple);
        });

        // Animación en inputs
        document.querySelectorAll('.ceutec-input').forEach(input => {
            input.addEventListener('focus', () => {
                input.parentElement?.classList.add('focused');
                input.parentElement?.parentElement?.classList.add('focused');
            });
            
            input.addEventListener('blur', () => {
                input.parentElement?.classList.remove('focused');
                input.parentElement?.parentElement?.classList.remove('focused');
            });
            
            // Validación en tiempo real para email
            if (input.type === 'email') {
                input.addEventListener('input', validateEmail);
            }
            
            // Validación de contraseña
            if (input.type === 'password') {
                input.addEventListener('input', validatePassword);
            }
        });

        // Hover effects en tarjetas
        document.querySelectorAll('.ceutec-card').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                const angleX = (y - centerY) / 20;
                const angleY = (centerX - x) / 20;
                
                card.style.transform = `perspective(1000px) rotateX(${angleX}deg) rotateY(${angleY}deg) translateY(-4px)`;
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });
        });
    };

    // Validación de email en tiempo real
    const validateEmail = (e) => {
        const email = e.target.value;
        const validationIcon = e.target.parentElement.querySelector('.validation-icon');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (email.length > 0) {
            if (emailRegex.test(email)) {
                validationIcon.innerHTML = '<i class="fas fa-check-circle text-green-500 animate-scale-in"></i>';
                validationIcon.classList.remove('hidden');
                e.target.classList.add('border-green-500');
                e.target.classList.remove('border-red-500');
            } else {
                validationIcon.innerHTML = '<i class="fas fa-exclamation-circle text-yellow-500 animate-scale-in"></i>';
                validationIcon.classList.remove('hidden');
                e.target.classList.add('border-yellow-500');
                e.target.classList.remove('border-green-500');
            }
        } else {
            validationIcon.classList.add('hidden');
            e.target.classList.remove('border-green-500', 'border-yellow-500', 'border-red-500');
        }
    };

    // Validación de contraseña
    const validatePassword = (e) => {
        const password = e.target.value;
        const strengthBars = document.querySelectorAll('.strength-bar');
        const strengthContainer = document.querySelector('.password-strength');
        
        if (password.length > 0) {
            strengthContainer.classList.remove('hidden');
            
            // Calcular fuerza
            let strength = 0;
            if (password.length >= 8) strength++;
            if (password.match(/[A-Z]/)) strength++;
            if (password.match(/[0-9]/)) strength++;
            if (password.match(/[^A-Za-z0-9]/)) strength++;
            
            // Actualizar barras
            const colors = ['bg-red-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600'];
            strengthBars.forEach((bar, index) => {
                if (index < strength) {
                    bar.classList.remove('bg-gray-200', 'bg-red-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600');
                    bar.classList.add(colors[Math.min(index, colors.length - 1)]);
                    bar.style.width = '100%';
                } else {
                    bar.classList.remove('bg-red-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600');
                    bar.classList.add('bg-gray-200');
                }
            });
        } else {
            strengthContainer.classList.add('hidden');
        }
    };

    // Efecto ripple mejorado
    const createRipple = (e) => {
        const button = e.currentTarget;
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        ripple.className = 'ripple';

        button.appendChild(ripple);

        setTimeout(() => {
            ripple.remove();
        }, 600);
    };

    // Animaciones al hacer scroll
    const initScrollAnimations = () => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-slide-up');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '50px' });

        document.querySelectorAll('.ceutec-card').forEach(card => {
            observer.observe(card);
        });
    };

    // Validación del formulario
    const initFormValidation = () => {
        if (elements.loginForm) {
            elements.loginForm.addEventListener('submit', handleLogin);
            
            // Validar campos en submit
            elements.loginForm.addEventListener('submit', (e) => {
                const email = elements.emailInput?.value;
                const password = elements.passwordInput?.value;
                
                if (!email || !password) {
                    e.preventDefault();
                    showError('Por favor completa todos los campos', 'warning');
                    
                    // Animación de shake en campos vacíos
                    if (!email) {
                        elements.emailInput?.classList.add('animate-shake');
                        setTimeout(() => {
                            elements.emailInput?.classList.remove('animate-shake');
                        }, 500);
                    }
                    if (!password) {
                        elements.passwordInput?.classList.add('animate-shake');
                        setTimeout(() => {
                            elements.passwordInput?.classList.remove('animate-shake');
                        }, 500);
                    }
                }
            });
        }
    };

    // Cargar usuario recordado
    const loadRememberedUser = () => {
        const remembered = localStorage.getItem('rememberedUser');
        if (remembered && elements.emailInput) {
            elements.emailInput.value = remembered;
            elements.rememberCheckbox.checked = true;
        }
    };

    // Bind de eventos
    const bindEvents = () => {
        if (elements.loginForm) {
            elements.loginForm.addEventListener('submit', handleLogin);
        }

        if (elements.uploadForm) {
            elements.uploadForm.addEventListener('submit', handleUpload);
        }

        if (elements.fileInput) {
            elements.fileInput.addEventListener('change', handleFileSelect);
        }

        if (elements.passwordToggle) {
            elements.passwordToggle.addEventListener('click', togglePassword);
        }

        if (elements.clearFileBtn) {
            elements.clearFileBtn.addEventListener('click', clearFile);
        }

        if (elements.dropzone) {
            initDropzone();
        }

        // Recordar usuario
        if (elements.rememberCheckbox && elements.emailInput) {
            elements.rememberCheckbox.addEventListener('change', (e) => {
                if (e.target.checked && elements.emailInput.value) {
                    localStorage.setItem('rememberedUser', elements.emailInput.value);
                } else {
                    localStorage.removeItem('rememberedUser');
                }
            });
        }
    };

    // Handlers mejorados
    const handleLogin = async (e) => {
        e.preventDefault();
        
        if (isLoading) return;
        
        const email = elements.emailInput?.value;
        const password = elements.passwordInput?.value;

        if (!email || !password) {
            showError('Por favor ingresa tu correo y contraseña', 'warning');
            
            // Animación de atención
            if (!email) {
                elements.emailInput?.classList.add('animate-pulse');
                setTimeout(() => {
                    elements.emailInput?.classList.remove('animate-pulse');
                }, 1000);
            }
            if (!password) {
                elements.passwordInput?.classList.add('animate-pulse');
                setTimeout(() => {
                    elements.passwordInput?.classList.remove('animate-pulse');
                }, 1000);
            }
            return;
        }

        isLoading = true;
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        // Animación de carga mejorada
        submitBtn.innerHTML = `
            <i class="fas fa-spinner fa-spin mr-2"></i>
            <span>Accediendo</span>
            <span class="loading-dots">
                <span class="dot">.</span>
                <span class="dot">.</span>
                <span class="dot">.</span>
            </span>
        `;
        submitBtn.disabled = true;

        // Simular carga (reemplazar con llamada real)
        setTimeout(() => {
            showLoginSuccess();
            isLoading = false;
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }, 2000);
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        
        if (!currentFile) {
            showError('Por favor selecciona un archivo', 'warning');
            
            // Animación de atención en el dropzone
            elements.dropzone?.classList.add('animate-pulse', 'border-red-500');
            setTimeout(() => {
                elements.dropzone?.classList.remove('animate-pulse', 'border-red-500');
            }, 1000);
            return;
        }

        await processFile(currentFile);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validar tipo de archivo
            if (!file.name.match(/\.(xlsx|xls)$/)) {
                showError('Formato no válido. Solo archivos Excel (.xlsx, .xls)', 'error');
                return;
            }
            
            // Validar tamaño (10MB)
            if (file.size > 10 * 1024 * 1024) {
                showError('El archivo no puede ser mayor a 10MB', 'error');
                return;
            }

            currentFile = file;
            showFileInfo(file);
            
            // Animación de éxito
            showSuccess('Archivo cargado correctamente');
        }
    };

    // Funciones UI mejoradas
    const togglePassword = () => {
        const passwordInput = elements.passwordInput;
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        const icon = elements.passwordToggle.querySelector('i');
        if (icon) {
            icon.className = type === 'password' ? 'far fa-eye' : 'far fa-eye-slash';
            
            // Animación del ícono mejorada
            icon.style.transform = 'scale(0.5) rotate(180deg)';
            setTimeout(() => {
                icon.style.transform = 'scale(1) rotate(0deg)';
            }, 150);
        }
    };

    const showFileInfo = (file) => {
        if (!elements.fileInfo) return;
        
        elements.fileName.textContent = file.name;
        const size = (file.size / 1024).toFixed(2);
        elements.fileSize.textContent = `${size} KB`;
        
        // Animación de entrada mejorada
        elements.fileInfo.classList.remove('hidden');
        elements.fileInfo.style.animation = 'slideUp 0.4s var(--transition-spring)';
        
        // Scroll suave hacia el botón de procesar
        elements.processBtn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const clearFile = () => {
        if (elements.fileInput) {
            elements.fileInput.value = '';
        }
        if (elements.fileInfo) {
            elements.fileInfo.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                elements.fileInfo.classList.add('hidden');
            }, 200);
        }
        if (elements.progressContainer) {
            elements.progressContainer.classList.add('hidden');
        }
        if (elements.uploadResponse) {
            elements.uploadResponse.classList.add('hidden');
        }
        currentFile = null;
    };

    const showError = (message, type = 'error') => {
        if (!elements.errorMessage) return;
        
        const colors = {
            error: 'red',
            warning: 'yellow',
            success: 'green',
            info: 'blue'
        };
        
        const color = colors[type] || 'red';
        const icon = {
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            success: 'check-circle',
            info: 'info-circle'
        };
        
        elements.errorMessage.innerHTML = `
            <div class="bg-${color}-50 border border-${color}-200 rounded-lg p-4 animate-slide-down relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-r from-${color}-500/0 via-${color}-500/5 to-${color}-500/0 translate-x-[-100%] animate-shine"></div>
                <p class="text-sm text-${color}-700 flex items-center">
                    <i class="fas fa-${icon[type]} mr-2 text-${color}-500 animate-pulse"></i>
                    <span class="error-text">${message}</span>
                </p>
            </div>
        `;
        elements.errorMessage.classList.remove('hidden');
        
        // Auto-cerrar después de 5 segundos
        setTimeout(() => {
            elements.errorMessage.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                elements.errorMessage.classList.add('hidden');
                elements.errorMessage.style.animation = '';
            }, 300);
        }, 5000);
    };

    const showSuccess = (message) => {
        showError(message, 'success');
    };

    const showLoginSuccess = () => {
        if (elements.loginContainer) {
            elements.loginContainer.style.animation = 'fadeOut 0.4s var(--transition-smooth)';
            setTimeout(() => {
                elements.loginContainer.classList.add('hidden');
                elements.dashboardContainer?.classList.remove('hidden');
                if (elements.dashboardContainer) {
                    elements.dashboardContainer.style.animation = 'slideUp 0.5s var(--transition-spring)';
                }
                
                // Mostrar notificación de bienvenida
                showSuccess('¡Bienvenido al Sistema de Equivalencias!');
            }, 400);
        }
    };

    const processFile = async (file) => {
        // Mostrar progreso
        elements.progressContainer?.classList.remove('hidden');
        elements.uploadResponse?.classList.add('hidden');
        elements.progressBar.style.width = '0%';
        
        // Simular progreso con curva de aceleración mejorada
        let progress = 0;
        const totalSteps = 60;
        const stepTime = 40;
        
        const progressInterval = setInterval(() => {
            // Curva de progreso más natural (ease-out cuadrático)
            const target = 100;
            const increment = Math.max(0.5, (target - progress) / 20);
            progress = Math.min(100, progress + increment);
            
            if (elements.progressBar) {
                elements.progressBar.style.width = progress + '%';
            }
            if (elements.progressPercent) {
                elements.progressPercent.textContent = Math.floor(progress) + '%';
            }
            
            if (progress >= 100) {
                clearInterval(progressInterval);
                
                // Animación de completado
                setTimeout(() => {
                    elements.progressContainer?.classList.add('hidden');
                    if (elements.responseMessage) {
                        const records = Math.floor(Math.random() * 300) + 100;
                        elements.responseMessage.innerHTML = `
                            <div class="flex items-center justify-between">
                                <div class="flex items-center">
                                    <i class="fas fa-check-circle text-green-500 mr-2 animate-bounce-slow"></i>
                                    <span class="text-gray-700">¡Procesado exitosamente!</span>
                                </div>
                                <span class="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                                    ${records} registros
                                </span>
                            </div>
                        `;
                    }
                    elements.uploadResponse?.classList.remove('hidden');
                    
                    // Celebrar con confeti virtual mejorado
                    celebrate();
                }, 500);
            }
        }, stepTime);
    };

    // Celebración mejorada
    const celebrate = () => {
        const colors = ['#B20000', '#FFD700', '#4CAF50', '#2196F3', '#FF6B6B', '#4ECDC4'];
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = 'fixed w-2 h-2 rounded-full pointer-events-none z-50';
                confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                confetti.style.left = Math.random() * 100 + '%';
                confetti.style.top = '80%';
                confetti.style.animation = `confetti ${Math.random() * 1 + 0.5}s ease-out forwards`;
                confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
                document.body.appendChild(confetti);
                
                setTimeout(() => confetti.remove(), 1500);
            }, i * 30);
        }
    };

    const initDropzone = () => {
        const dropzone = elements.dropzone;
        if (!dropzone) return;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => {
                dropzone.classList.add('dragover', 'border-[#B20000]', 'bg-[#B20000]/5', 'scale-102');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => {
                dropzone.classList.remove('dragover', 'border-[#B20000]', 'bg-[#B20000]/5', 'scale-102');
            }, false);
        });

        dropzone.addEventListener('drop', handleDrop, false);
    };

    const preventDefaults = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length && elements.fileInput) {
            elements.fileInput.files = files;
            handleFileSelect({ target: { files: files } });
        }
    };

    // API pública mejorada
    return {
        init,
        showLoginSuccess,
        showError,
        showSuccess,
        clearFile
    };
})();

// Estilos adicionales para animaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        0% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.95); }
    }
    
    @keyframes confetti {
        0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
        100% { transform: translateY(-200px) rotate(720deg) scale(0); opacity: 0; }
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    
    .animate-shake {
        animation: shake 0.5s ease-in-out;
    }
    
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
        z-index: 10;
    }
    
    @keyframes ripple {
        0% { transform: scale(0); opacity: 0.5; }
        100% { transform: scale(4); opacity: 0; }
    }
    
    .dragover {
        border-color: #B20000 !important;
        background: rgba(178, 0, 0, 0.05) !important;
        transform: scale(1.02) !important;
        transition: all 0.3s var(--transition-smooth);
    }
    
    .scale-102 {
        transform: scale(1.02);
    }
    
    .loading-dots {
        display: inline-flex;
        margin-left: 2px;
    }
    
    .dot {
        animation: loadingDot 1.4s infinite;
        opacity: 0;
    }
    
    .dot:nth-child(1) { animation-delay: 0s; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    
    @keyframes loadingDot {
        0% { opacity: 0; transform: translateY(0); }
        50% { opacity: 1; transform: translateY(-5px); }
        100% { opacity: 0; transform: translateY(0); }
    }
    
    /* Efecto de glassmorphism mejorado */
    .glass-effect {
        background: rgba(255, 255, 255, 0.7);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.3);
    }
    
    /* Transiciones suaves para todos los elementos interactivos */
    button, a, input, .ceutec-card {
        transition: all 0.3s var(--transition-smooth);
    }
    
    /* Mejoras de accesibilidad */
    @media (prefers-reduced-motion: reduce) {
        * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
        }
    }
`;

document.head.appendChild(style);

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    UI.init();
});