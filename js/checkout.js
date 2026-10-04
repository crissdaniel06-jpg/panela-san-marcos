(() => {
    const form = document.getElementById("checkout-form");

    if (!form) {
        return;
    }

    const cart = window.PanelaStore.getCart();
    const emptyState = document.getElementById("checkout-empty");
    const checkoutContent = document.getElementById("checkout-content");
    const feedback = document.getElementById("checkout-feedback");
    const cityInput = document.getElementById("city");
    const shippingStatus = document.getElementById("shipping-status");
    const destinationRow = document.getElementById("checkout-destination-row");
    const guestPrompt = document.querySelector("[data-checkout-guest]");

    if (cart.length === 0) {
        emptyState.hidden = false;
        return;
    }

    checkoutContent.hidden = false;

    const currentUser = window.PanelaStore.getCurrentUser();
    guestPrompt.hidden = Boolean(currentUser);

    if (currentUser) {
        document.getElementById("first-name").value = currentUser.firstName;
        document.getElementById("last-name").value = currentUser.lastName;
        document.getElementById("email").value = currentUser.email;
    }

    function money(amount) {
        return `$${amount.toFixed(2)}`;
    }

    function renderSummary() {
        const currentCart = window.PanelaStore.getCart();
        const items = document.getElementById("checkout-items");

        items.innerHTML = currentCart.map(item => {
            const product = window.PanelaStore.getProduct(item.id);
            return `<li><span>${product.nombre} × ${item.quantity}</span><strong>${money(product.precio * item.quantity)}</strong></li>`;
        }).join("");

        const subtotal = window.PanelaStore.getSubtotal();
        const shippingCost = window.PanelaStore.getShippingCost(cityInput.value);
        document.getElementById("checkout-subtotal").textContent = money(subtotal);
        document.getElementById("checkout-shipping").textContent = shippingCost === null ? "—" : money(shippingCost);
        document.getElementById("checkout-total").textContent = shippingCost === null ? "—" : money(subtotal + shippingCost);
        destinationRow.hidden = shippingCost === null;
        document.getElementById("checkout-destination").textContent = shippingCost === null ? "" : cityInput.value;
    }

    function clearFieldError(control, errorElement) {
        control.removeAttribute("aria-invalid");
        errorElement.textContent = "";
    }

    function setFieldError(control, errorElement, message) {
        control.setAttribute("aria-invalid", "true");
        errorElement.textContent = message;
    }

    const fields = [
        {
            id: "first-name",
            errorId: "error-first-name",
            message: "Ingresa tu nombre.",
            isValid: value => value.trim().length > 0
        },
        {
            id: "last-name",
            errorId: "error-last-name",
            message: "Ingresa tu apellido.",
            isValid: value => value.trim().length > 0
        },
        {
            id: "phone",
            errorId: "error-phone",
            message: "Ingresa un número de teléfono válido.",
            isValid: value => /^[+]?[-\d\s()]{7,20}$/.test(value.trim()) && value.replace(/\D/g, "").length >= 7
        },
        {
            id: "email",
            errorId: "error-email",
            message: "Ingresa un correo electrónico válido.",
            isValid: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
        },
        {
            id: "address",
            errorId: "error-address",
            message: "Ingresa una dirección de entrega válida.",
            isValid: value => value.trim().length >= 5
        },
        {
            id: "city",
            errorId: "error-city",
            message: "Selecciona una ciudad para calcular el costo de envío.",
            isValid: value => window.PanelaStore.getShippingCost(value) !== null
        }
    ];

    fields.forEach(field => {
        const control = document.getElementById(field.id);
        const errorElement = document.getElementById(field.errorId);
        const eventName = control.tagName === "SELECT" ? "change" : "input";
        control.addEventListener(eventName, () => {
            if (control.getAttribute("aria-invalid") === "true" && field.isValid(control.value)) {
                clearFieldError(control, errorElement);
            }
            feedback.textContent = "";

            if (control === cityInput) {
                const cost = window.PanelaStore.getShippingCost(cityInput.value);
                renderSummary();
                shippingStatus.textContent = cost === null ? "" : `El costo de envío se actualizó a ${money(cost)}.`;
            }
        });
    });

    const paymentOptions = [...form.querySelectorAll('[name="metodoPago"]')];
    const transferInfo = document.getElementById("transfer-info");
    const transferMessage = "Los datos para realizar la transferencia serán proporcionados por Panela San Marcos después de confirmar el pedido.";

    function updatePaymentGuidance() {
        const transferSelected = document.getElementById("payment-transfer").checked;
        transferInfo.textContent = transferSelected ? transferMessage : "";
        transferInfo.hidden = !transferSelected;
    }

    paymentOptions.forEach(radio => {
        radio.addEventListener("change", () => {
            paymentOptions.forEach(option => option.removeAttribute("aria-invalid"));
            document.getElementById("error-payment").textContent = "";
            feedback.textContent = "";
            updatePaymentGuidance();
        });
    });

    form.addEventListener("submit", event => {
        event.preventDefault();
        feedback.textContent = "";

        const invalidControls = [];

        fields.forEach(field => {
            const control = document.getElementById(field.id);
            const errorElement = document.getElementById(field.errorId);

            if (!field.isValid(control.value)) {
                setFieldError(control, errorElement, field.message);
                invalidControls.push(control);
            } else {
                clearFieldError(control, errorElement);
            }
        });

        const paymentError = document.getElementById("error-payment");

        if (!paymentOptions.some(option => option.checked)) {
            paymentOptions.forEach(option => option.setAttribute("aria-invalid", "true"));
            paymentError.textContent = "Selecciona un método de pago.";
            invalidControls.push(paymentOptions[0]);
        } else {
            paymentOptions.forEach(option => option.removeAttribute("aria-invalid"));
            paymentError.textContent = "";
        }

        if (invalidControls.length > 0) {
            feedback.textContent = "Revisa los campos indicados antes de continuar.";
            invalidControls[0].focus();
            return;
        }

        const formData = new FormData(form);
        const currentCart = window.PanelaStore.getCart();
        const subtotal = window.PanelaStore.getSubtotal();
        const city = formData.get("ciudad");
        const shippingCost = window.PanelaStore.getShippingCost(city);
        const order = {
            reference: `PSM-${String(Date.now()).slice(-8)}`,
            customer: {
                firstName: formData.get("nombre").trim(),
                lastName: formData.get("apellido").trim(),
                phone: formData.get("telefono").trim(),
                email: formData.get("correo").trim(),
                address: formData.get("direccion").trim(),
                city: city.trim()
            },
            destination: city,
            paymentMethod: formData.get("metodoPago"),
            items: currentCart.map(item => {
                const product = window.PanelaStore.getProduct(item.id);
                return {
                    id: product.id,
                    name: product.nombre,
                    presentation: product.presentacion,
                    price: product.precio,
                    quantity: item.quantity,
                    subtotal: product.precio * item.quantity
                };
            }),
            subtotal,
            shipping: shippingCost,
            total: subtotal + shippingCost,
            createdAt: new Date().toISOString(),
            status: "Pedido recibido"
        };

        if (!window.PanelaStore.saveOrder(order)) {
            feedback.textContent = "No se pudo guardar el pedido en este navegador. Inténtalo de nuevo.";
            return;
        }

        window.PanelaStore.clearCart();
        window.location.assign("confirmacion.html");
    });

    renderSummary();
})();
