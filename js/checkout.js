 (async () => {
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

    if (!window.supabaseClient) {
        guestPrompt.hidden = false;
        guestPrompt.textContent = "Para realizar una compra se requiere configurar Supabase y acceder con una cuenta.";
        form.hidden = true;
        return;
    }
    const { data: { session: initialSession } } = await window.supabaseClient.auth.getSession();
    window.PanelaAuthUser = initialSession?.user ? { id: initialSession.user.id, email: initialSession.user.email, firstName: initialSession.user.user_metadata?.first_name || "" } : null;
    const currentUser = window.PanelaStore.getCurrentUser();
    guestPrompt.hidden = Boolean(currentUser);
    if (!currentUser) {
        guestPrompt.hidden = false;
        guestPrompt.innerHTML = 'Para finalizar la compra, <a href="login.html?return=checkout.html">inicia sesión</a> o <a href="registro.html?return=checkout.html">crea una cuenta</a>. Tu carrito se conservará.';
        form.hidden = true;
        return;
    }

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
    const transferDialogEnabled = true;
    const transferDialog = document.getElementById("transfer-dialog");
    const receiptInput = document.getElementById("receipt-upload");
    const receiptPreview = document.getElementById("receipt-preview");
    const receiptStatus = document.getElementById("receipt-status");
    const receiptError = document.getElementById("receipt-error");
    const receiptRemove = document.getElementById("receipt-remove");
    let receiptUrl = null;
    let pendingOrder = null;
    let dialogTrigger = null;

    function updatePaymentGuidance() {
        const transferSelected = document.getElementById("payment-transfer").checked;
        transferInfo.textContent = "Simulación académica. No se realiza ni verifica una transferencia real; el comprobante se recibirá en almacenamiento privado.";
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

    function validateAndCreateOrder() {
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
            return null;
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
            status: "PENDIENTE",
            paymentStatus: "PENDIENTE",
            requestId: crypto.randomUUID()
        };

        return order;
    }

    let submitting = false;
    async function completeOrder() {
        if (!pendingOrder || submitting) return;
        submitting = true;
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        const client = window.supabaseClient;
        try {
            const { data: { session } } = await client.auth.getSession();
            if (!session) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
            const orderInput = {
                p_items: pendingOrder.items.map(item => ({ id: item.id, quantity: item.quantity })),
                p_request_id: pendingOrder.requestId,
                p_city: pendingOrder.destination,
                p_payment_method: pendingOrder.paymentMethod,
                p_customer: pendingOrder.customer
            };
            const { data: orderId, error } = await client.rpc("create_order", orderInput);
            if (error) throw error;
            pendingOrder.reference = orderId;
            if (pendingOrder.paymentMethod === "Transferencia bancaria") {
                const file = receiptInput.files[0];
                if (!file) throw new Error("Adjunta el comprobante para continuar.");
                const path = `${session.user.id}/${orderId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
                const upload = await client.storage.from("transfer-receipts").upload(path, file, { contentType: file.type, upsert: false });
                if (upload.error) throw upload.error;
                const receipt = await client.from("transfer_receipts").insert({ order_id: orderId, user_id: session.user.id, storage_path: path });
                if (receipt.error) throw receipt.error;
                pendingOrder.paymentStatus = "COMPROBANTE_RECIBIDO";
            }
            pendingOrder.createdAt = new Date().toISOString();
            if (!window.PanelaStore.saveOrder(pendingOrder)) throw new Error("Pedido creado, pero no se pudo preparar el resumen local. Contacta soporte con este identificador: " + orderId);
            window.PanelaStore.clearCart();
            window.location.assign("confirmacion.html");
        } catch (error) {
            const message = error.message || "No se pudo crear el pedido. Inténtalo de nuevo.";
            if (pendingOrder.paymentMethod === "Transferencia bancaria") receiptError.textContent = message;
            else feedback.textContent = message;
            submitting = false;
            if (submitButton) submitButton.disabled = false;
        }
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (transferDialog.open) return;
        const order = validateAndCreateOrder();
        if (!order) return;

        if (transferDialogEnabled && order.paymentMethod === "Transferencia bancaria") {
            if (!receiptInput.files.length) {
                pendingOrder = order;
                dialogTrigger = document.activeElement;
                transferDialog.showModal();
                document.getElementById("transfer-dialog-close").focus();
                return;
            }
            pendingOrder = order;
            dialogTrigger = document.activeElement;
            transferDialog.showModal();
            document.getElementById("transfer-dialog-close").focus();
            return;
        }
        pendingOrder = order;
            await completeOrder();
    });

    function clearReceipt() {
        if (receiptUrl) URL.revokeObjectURL(receiptUrl);
        receiptUrl = null;
        receiptInput.value = "";
        receiptInput.removeAttribute("aria-invalid");
        receiptError.textContent = "";
        receiptPreview.removeAttribute("src");
        receiptPreview.hidden = true;
        receiptRemove.hidden = true;
        receiptStatus.textContent = "";
    }

    receiptInput.addEventListener("change", () => {
        const file = receiptInput.files[0];
        receiptError.textContent = "";
        if (!file) return;
        if (!/^image\/(png|jpeg)$/.test(file.type) && file.type !== "application/pdf" || file.size > 5 * 1024 * 1024) {
            clearReceipt();
            receiptError.textContent = "Elige un archivo PNG, JPG o PDF de máximo 5 MB.";
            receiptInput.setAttribute("aria-invalid", "true");
            return;
        }
        receiptInput.removeAttribute("aria-invalid");
        if (receiptUrl) URL.revokeObjectURL(receiptUrl);
        receiptUrl = URL.createObjectURL(file);
        if (file.type.startsWith("image/")) { receiptPreview.src = receiptUrl; receiptPreview.hidden = false; }
        else receiptPreview.hidden = true;
        receiptRemove.hidden = false;
        receiptStatus.textContent = `Archivo seleccionado: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB). Se subirá al almacenamiento privado al confirmar.`;
    });

    receiptRemove.addEventListener("click", clearReceipt);
    document.getElementById("transfer-confirm").addEventListener("click", () => {
        if (!receiptInput.files.length) {
            receiptInput.setAttribute("aria-invalid", "true");
            receiptError.textContent = "Adjunta el comprobante para confirmar el pedido por transferencia.";
            receiptInput.focus();
            return;
        }
        completeOrder();
    });
    document.getElementById("transfer-dialog-close").addEventListener("click", () => transferDialog.close());
    document.getElementById("transfer-dialog-cancel").addEventListener("click", () => transferDialog.close());
    transferDialog.addEventListener("close", () => {
        clearReceipt();
        pendingOrder = null;
        if (dialogTrigger && document.contains(dialogTrigger)) dialogTrigger.focus();
    });

    renderSummary();
})();
