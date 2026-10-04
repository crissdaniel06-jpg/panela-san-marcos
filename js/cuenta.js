(() => {
    const returnTargets = new Set(["index.html", "productos.html", "carrito.html", "checkout.html"]);
    const parameters = new URLSearchParams(window.location.search);
    const requestedReturn = parameters.get("return");
    const returnTo = returnTargets.has(requestedReturn) ? requestedReturn : "index.html";
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

        if (registerLink && requestedReturn === "checkout.html") {
            registerLink.href = "registro.html?return=checkout.html";
        }

        if (parameters.get("registered") === "1") {
            feedback.textContent = "Cuenta creada correctamente. Inicia sesión para continuar.";
        }

        bindErrorClearing(loginForm);

        loginForm.addEventListener("submit", event => {
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

            const result = window.PanelaStore.login(emailInput.value, passwordInput.value);

            if (!result.ok) {
                feedback.textContent = result.reason === "storage"
                    ? "No se pudo guardar la sesión en este navegador. Inténtalo de nuevo."
                    : "El correo o la contraseña no son correctos.";
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

        if (loginLink && requestedReturn === "checkout.html") {
            loginLink.href = "login.html?return=checkout.html";
        }

        bindErrorClearing(registerForm);

        registerForm.addEventListener("submit", event => {
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

            const result = window.PanelaStore.registerUser({
                firstName: values["register-first-name"],
                lastName: values["register-last-name"],
                email: values["register-email"],
                password: values["register-password"]
            });

            if (!result.ok) {
                if (result.reason === "duplicate") {
                    const emailInput = document.getElementById("register-email");
                    displayError(emailInput, document.getElementById("register-email-error"), "Ya existe una cuenta con este correo.");
                    emailInput.focus();
                } else {
                    feedback.textContent = "No se pudo crear la cuenta en este navegador. Inténtalo de nuevo.";
                }
                return;
            }

            const returnQuery = returnTo !== "index.html" ? `&return=${encodeURIComponent(returnTo)}` : "";
            feedback.textContent = "Cuenta creada correctamente.";
            window.PanelaUI.showToast("Cuenta creada correctamente.");
            window.setTimeout(() => window.location.assign(`login.html?registered=1${returnQuery}`), 700);
        });
    }
})();
