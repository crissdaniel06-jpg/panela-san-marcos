(() => {
    const returnTargets = new Set(["index.html", "productos.html", "carrito.html", "checkout.html", "cuenta.html", "favoritos.html"]);
    const parameters = new URLSearchParams(window.location.search);
    const requestedReturn = parameters.get("return");
    const safeProductReturn = /^producto\.html\?id=\d+(?:&favorite=1)?$/.test(requestedReturn || "");
    const safeCatalogFavoriteReturn = /^productos\.html\?favorite=\d+$/.test(requestedReturn || "");
    const returnTo = returnTargets.has(requestedReturn) || safeProductReturn || safeCatalogFavoriteReturn ? requestedReturn : "index.html";
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
    }

    function displayError(control, messageElement, message) {
        control.setAttribute("aria-invalid", "true");
        messageElement.textContent = message;
    }

    function clearError(control, messageElement) {
        control.removeAttribute("aria-invalid");
        messageElement.textContent = "";
    }

    function bindErrorClearing(form) {
        form.querySelectorAll("input").forEach(input => {
            input.addEventListener("input", () => {
                const message = document.getElementById(`${input.id}-error`);

                if (input.getAttribute("aria-invalid") === "true") {
                    clearError(input, message);
                }

                form.querySelector("[role='alert']").textContent = "";
            });
        });
    }

    function bindPasswordToggles(form) {
        form.querySelectorAll("[data-password-toggle]").forEach(toggle => {
            const input = document.getElementById(toggle.getAttribute("aria-controls"));
            const eyeIcon = toggle.querySelector(".bi-eye");
            const eyeSlashIcon = toggle.querySelector(".bi-eye-slash");

            toggle.addEventListener("click", () => {
                const shouldShow = input.type === "password";
                input.type = shouldShow ? "text" : "password";
                toggle.setAttribute("aria-label", shouldShow ? "Ocultar contraseña" : "Mostrar contraseña");
                eyeIcon.hidden = shouldShow;
                eyeSlashIcon.hidden = !shouldShow;
            });
        });
    }

    if (loginForm) {
        bindPasswordToggles(loginForm);
        const emailInput = document.getElementById("login-email");
        const passwordInput = document.getElementById("login-password");
        const emailError = document.getElementById("login-email-error");
        const passwordError = document.getElementById("login-password-error");
        const feedback = document.getElementById("login-feedback");
        const registerLink = document.querySelector("[data-register-link]");
        const recoveryButton = document.querySelector("[data-password-recovery]");

        recoveryButton?.addEventListener("click", async () => {
            feedback.textContent = "";
            if (!isValidEmail(emailInput.value)) {
                displayError(emailInput, emailError, "Ingresa tu correo electrónico para enviarte el enlace de recuperación.");
                emailInput.focus();
                return;
            }
            if (!window.supabaseClient) {
                feedback.textContent = "La recuperación requiere configurar Supabase.";
                return;
            }
            recoveryButton.disabled = true;
            const redirectTo = `${window.location.origin}${window.location.pathname.replace(/login\.html$/, "cuenta.html")}?recovery=1`;
            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(emailInput.value.trim(), { redirectTo });
            recoveryButton.disabled = false;
            feedback.textContent = error ? "No se pudo enviar el enlace de recuperación. Inténtalo más tarde." : "Si el correo corresponde a una cuenta, recibirás instrucciones para restablecer la contraseña.";
        });

        if (registerLink && returnTo !== "index.html") registerLink.href = `registro.html?return=${encodeURIComponent(returnTo)}`;

        if (parameters.get("registered") === "1") {
            feedback.textContent = "Cuenta creada correctamente. Inicia sesión para continuar.";
        }

        bindErrorClearing(loginForm);

        loginForm.addEventListener("submit", async event => {
            event.preventDefault();
            feedback.textContent = "";
            const invalid = [];

            if (!emailInput.value.trim()) {
                displayError(emailInput, emailError, "Ingresa tu correo electrónico.");
                invalid.push(emailInput);
            } else if (!isValidEmail(emailInput.value)) {
                displayError(emailInput, emailError, "Ingresa un correo electrónico válido.");
                invalid.push(emailInput);
            } else {
                clearError(emailInput, emailError);
            }

            if (!passwordInput.value) {
                displayError(passwordInput, passwordError, "Ingresa tu contraseña.");
                invalid.push(passwordInput);
            } else {
                clearError(passwordInput, passwordError);
            }

            if (invalid.length > 0) {
                invalid[0].focus();
                return;
            }

            const result = await window.PanelaStore.login(emailInput.value, passwordInput.value);

            if (result.error) {
                feedback.textContent = result.error.message.includes("no está configurado")
                    ? "El acceso requiere configurar Supabase. Consulta docs/IMPLEMENTACION_TECNICA.md."
                    : "No se pudo iniciar sesión. Verifica tus datos o confirma tu correo.";
                emailInput.setAttribute("aria-invalid", "true");
                passwordInput.setAttribute("aria-invalid", "true");
                passwordInput.focus();
                return;
            }

            feedback.textContent = "Sesión iniciada correctamente.";
            window.PanelaUI.showToast("Sesión iniciada correctamente.");
            window.setTimeout(() => window.location.assign(returnTo), 650);
        });
    }

    if (registerForm) {
        bindPasswordToggles(registerForm);
        const fields = [
            { id: "register-first-name", errorId: "register-first-name-error", message: "Ingresa tu nombre.", valid: value => value.trim().length > 0 },
            { id: "register-last-name", errorId: "register-last-name-error", message: "Ingresa tu apellido.", valid: value => value.trim().length > 0 },
            { id: "register-email", errorId: "register-email-error", message: "Ingresa un correo electrónico válido.", valid: isValidEmail },
            { id: "register-password", errorId: "register-password-error", message: "La contraseña debe tener al menos 8 caracteres.", valid: value => value.length >= 8 },
            { id: "register-confirm-password", errorId: "register-confirm-password-error", message: "Confirma tu contraseña.", valid: value => value.length > 0 }
        ];
        const feedback = document.getElementById("register-feedback");
        const loginLink = document.querySelector("[data-login-link]");

        if (loginLink && returnTo !== "index.html") loginLink.href = `login.html?return=${encodeURIComponent(returnTo)}`;

        bindErrorClearing(registerForm);

        registerForm.addEventListener("submit", async event => {
            event.preventDefault();
            feedback.textContent = "";
            const invalid = [];
            const values = {};

            fields.forEach(field => {
                const control = document.getElementById(field.id);
                const message = document.getElementById(field.errorId);
                const value = control.value;
                values[field.id] = value;

                let errorMessage = "";
                if (!value.trim()) {
                    if (field.id === "register-password") {
                        errorMessage = "Ingresa tu contraseña.";
                    } else if (field.id === "register-confirm-password") {
                        errorMessage = "Confirma tu contraseña.";
                    } else if (field.id === "register-email") {
                        errorMessage = "Ingresa tu correo electrónico.";
                    } else {
                        errorMessage = field.message;
                    }
                } else if (!field.valid(value)) {
                    errorMessage = field.message;
                }

                if (errorMessage) {
                    displayError(control, message, errorMessage);
                    invalid.push(control);
                } else {
                    clearError(control, message);
                }
            });

            const passwordInput = document.getElementById("register-password");
            const confirmInput = document.getElementById("register-confirm-password");
            const confirmError = document.getElementById("register-confirm-password-error");

            if (passwordInput.value && confirmInput.value && passwordInput.value !== confirmInput.value) {
                displayError(confirmInput, confirmError, "Las contraseñas no coinciden.");
                if (!invalid.includes(confirmInput)) {
                    invalid.push(confirmInput);
                }
            }

            if (invalid.length > 0) {
                invalid[0].focus();
                return;
            }

            const result = await window.PanelaStore.registerUser({
                firstName: values["register-first-name"],
                lastName: values["register-last-name"],
                email: values["register-email"],
                password: values["register-password"],
                returnTo
            });

            if (result.error) {
                feedback.textContent = result.error.message.includes("no está configurado")
                    ? "El registro requiere configurar Supabase. Consulta docs/IMPLEMENTACION_TECNICA.md."
                    : "No se pudo crear la cuenta. Comprueba si el correo ya está registrado e inténtalo de nuevo.";
                return;
            }

            if (result.data?.session) {
                feedback.textContent = "Cuenta creada correctamente.";
                window.PanelaUI.showToast("Tu cuenta está lista.");
                window.setTimeout(() => window.location.assign(returnTo), 650);
            } else {
                feedback.textContent = "Solicitud enviada. Revisa tu correo para confirmar la cuenta antes de iniciar sesión.";
                window.PanelaUI.showToast("Revisa tu correo para confirmar la cuenta.");
            }
        });
    }
})();
