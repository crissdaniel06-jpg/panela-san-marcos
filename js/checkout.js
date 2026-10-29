 (async () => {
    const form = document.getElementById("checkout-form");

    if (!form) {
        return;
    }

    const emptyState = document.getElementById("checkout-empty");
    const checkoutContent = document.getElementById("checkout-content");
    const feedback = document.getElementById("checkout-feedback");
    const cityInput = document.getElementById("city");
    const shippingStatus = document.getElementById("shipping-status");
    const destinationRow = document.getElementById("checkout-destination-row");
    const guestPrompt = document.querySelector("[data-checkout-guest]");

    const cart = window.PanelaStore.getCart();
    if (cart.length === 0) {
        emptyState.hidden = false;
        return;
    }

    if (window.supabaseClient) {
        await window.PanelaAuthReady;
        if (!window.PanelaStore.getCurrentUser()) {
            window.location.replace("login.html?return=checkout.html");
            return;
        }
    }

    const productsLoad = await window.PanelaProductsReady;
    if (!productsLoad.ok) {
        emptyState.hidden = false;
        emptyState.querySelector("h2").textContent = "No podemos verificar el catálogo";
        emptyState.querySelector("p").textContent = "Tu carrito se conserva. Vuelve a intentarlo cuando se restablezca la conexión.";
        return;
    }
    checkoutContent.hidden = false;

    if (!window.supabaseClient) {
        guestPrompt.hidden = false;
        guestPrompt.textContent = "Para realizar una compra se requiere configurar Supabase y acceder con una cuenta.";
        form.hidden = true;
        return;
    }
    await window.PanelaAuthReady;
    const { data: { user: initialUser } } = await window.supabaseClient.auth.getUser();
    if (!initialUser || !window.PanelaStore.getCurrentUser()) {
        window.location.replace("login.html?return=checkout.html");
        return;
    }
    window.PanelaAuthUser = { id: initialUser.id, email: initialUser.email, firstName: "", lastName: "" };
    const currentUser = window.PanelaStore.getCurrentUser();
    guestPrompt.hidden = true;

    if (currentUser) {
        const { data: profile, error: profileError } = await window.supabaseClient
            .from("profiles")
            .select("first_name,last_name,phone,address,city")
            .eq("id", currentUser.id)
            .maybeSingle();
        if (profileError) {
            feedback.textContent = "No se pudieron cargar tus datos guardados. Puedes completar los campos manualmente.";
        } else if (profile) {
            document.getElementById("first-name").value = profile.first_name || "";
            document.getElementById("last-name").value = profile.last_name || "";
            document.getElementById("phone").value = profile.phone || "";
            document.getElementById("address").value = profile.address || "";
            document.getElementById("city").value = profile.city || "";
        }
        document.getElementById("email").value = currentUser.email || "";
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
    const transferDialogEnabled = false;
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
        transferInfo.textContent = "Las transferencias están temporalmente deshabilitadas mientras se confirman los datos de pago.";
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

        const cartStockMismatch = window.PanelaStore.getCart().find(item => {
            const product = window.PanelaStore.getProduct(item.id);
            return !product || item.quantity > product.stock;
        });
        if (cartStockMismatch) {
            feedback.textContent = "El stock disponible cambió. Revisa las cantidades en tu carrito antes de continuar.";
            return null;
        }

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
            requestId: null
        };

        return order;
    }

    async function assignRequestId(order) {
        const signature = JSON.stringify({
            userId: window.PanelaStore.getCurrentUser().id,
            items: order.items.map(({ id, quantity }) => ({ id, quantity })),
            city: order.destination,
            paymentMethod: order.paymentMethod,
            customer: order.customer
        });
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signature));
        const signatureKey = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
        const storageKey = `panela-order-request:${signatureKey}`;
        order.requestId = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey) || crypto.randomUUID();
        localStorage.setItem(storageKey, order.requestId);
        order.requestStorageKey = storageKey;
    }

    let submitting = false;
    let preparingOrder = false;
    async function completeOrder() {
        if (!pendingOrder || submitting) return;
        submitting = true;
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        const client = window.supabaseClient;
        try {
            const { data: { session } } = await client.auth.getSession();
            if (!session) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
            const savedProfile = await client.from("profiles").upsert({
                id: session.user.id,
                first_name: pendingOrder.customer.firstName,
                last_name: pendingOrder.customer.lastName,
                phone: pendingOrder.customer.phone,
                address: pendingOrder.customer.address,
                city: pendingOrder.customer.city,
                updated_at: new Date().toISOString()
            });
            if (savedProfile.error) throw savedProfile.error;
            const orderInput = {
                p_items: pendingOrder.items.map(item => ({ id: item.id, quantity: item.quantity })),
                p_request_id: pendingOrder.requestId,
                p_city: pendingOrder.destination,
                p_payment_method: pendingOrder.paymentMethod,
                p_customer: pendingOrder.customer
            };
            if (pendingOrder.paymentMethod !== "Pago contra entrega") {
                throw new Error("Ese método de pago no está disponible. Selecciona pago contra entrega.");
            }
            const { data: orderId, error } = await client.rpc("create_order", orderInput);
            if (error) throw new Error(orderErrorMessage(error));
            if (typeof orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
                throw new Error("El servidor no devolvió un identificador de pedido válido. Conservamos tu carrito para que puedas reintentar sin duplicar el pedido.");
            }
            const { data: savedOrder, error: savedOrderError } = await client.from("orders")
                .select("id,status,subtotal,shipping,total,payment_method,payment_status,customer_first_name,customer_last_name,customer_email,customer_phone,delivery_address,delivery_city,created_at,order_items(product_id,product_name,unit_price,quantity,line_subtotal)")
                .eq("id", orderId).single();
            if (savedOrderError) throw savedOrderError;
            pendingOrder.reference = savedOrder.id;
            pendingOrder.status = savedOrder.status;
            pendingOrder.subtotal = Number(savedOrder.subtotal);
            pendingOrder.shipping = Number(savedOrder.shipping);
            pendingOrder.total = Number(savedOrder.total);
            pendingOrder.paymentMethod = savedOrder.payment_method;
            pendingOrder.paymentStatus = savedOrder.payment_status;
            pendingOrder.destination = savedOrder.delivery_city;
            pendingOrder.createdAt = savedOrder.created_at;
            pendingOrder.customer = {
                firstName: savedOrder.customer_first_name,
                lastName: savedOrder.customer_last_name,
                email: savedOrder.customer_email,
                phone: savedOrder.customer_phone,
                address: savedOrder.delivery_address,
                city: savedOrder.delivery_city
            };
            pendingOrder.items = savedOrder.order_items.map(item => ({
                id: item.product_id,
                name: item.product_name,
                presentation: window.PanelaStore.getProduct(item.product_id)?.presentacion || "",
                price: Number(item.unit_price),
                quantity: Number(item.quantity),
                subtotal: Number(item.line_subtotal)
            }));
            if (pendingOrder.paymentMethod === "Transferencia bancaria") {
                const file = receiptInput.files[0];
                if (!file) throw new Error("Adjunta el comprobante para continuar.");
                const path = `${session.user.id}/${orderId}/receipt`;
                const { data: existingReceipt, error: receiptLookupError } = await client.from("transfer_receipts")
                    .select("id,storage_path").eq("order_id", orderId).eq("user_id", session.user.id).maybeSingle();
                if (receiptLookupError) throw receiptLookupError;
                if (!existingReceipt) {
                    const folder = `${session.user.id}/${orderId}`;
                    const { data: files, error: listError } = await client.storage.from("transfer-receipts").list(folder);
                    if (listError) throw listError;
                    const alreadyUploaded = files?.some(item => item.name === "receipt");
                    if (!alreadyUploaded) {
                        const upload = await client.storage.from("transfer-receipts").upload(path, file, { contentType: file.type, upsert: false });
                        if (upload.error) throw upload.error;
                    }
                    const receipt = await client.from("transfer_receipts").insert({ order_id: orderId, user_id: session.user.id, storage_path: path });
                    if (receipt.error) {
                        await client.storage.from("transfer-receipts").remove([path]);
                        throw receipt.error;
                    }
                }
                pendingOrder.paymentStatus = "PENDIENTE_VERIFICACION";
            }
            pendingOrder.createdAt = new Date().toISOString();
            if (!window.PanelaStore.saveOrder(pendingOrder)) throw new Error("Pedido creado, pero no se pudo preparar el resumen local. Contacta soporte con este identificador: " + orderId);
            window.PanelaStore.clearCart();
            localStorage.removeItem(pendingOrder.requestStorageKey);
            sessionStorage.removeItem(pendingOrder.requestStorageKey);
            window.location.assign("confirmacion.html");
        } catch (error) {
            const message = error?.code ? orderErrorMessage(error) : (error.message || "No se pudo crear el pedido. Inténtalo de nuevo.");
            feedback.textContent = message;
            if (pendingOrder.paymentMethod === "Transferencia bancaria") receiptError.textContent = message;
            submitting = false;
            if (submitButton) submitButton.disabled = false;
        }
    }

    function orderErrorMessage(error) {
        const message = String(error?.message || "");
        const knownErrors = {
            AUTH_REQUIRED: "Tu sesión no está activa. Inicia sesión nuevamente.",
            INVALID_CITY: "No podemos entregar en esa ciudad. Selecciona una ciudad disponible.",
            INVALID_PAYMENT_METHOD: "Selecciona un método de pago disponible.",
            INVALID_CUSTOMER_DATA: "Revisa tu nombre, apellido, correo, teléfono y dirección.",
            EMPTY_CART: "Tu carrito está vacío.",
            INVALID_QUANTITY: "Revisa las cantidades de los productos.",
            UNAVAILABLE_PRODUCT: "El stock cambió. Actualiza tu carrito antes de volver a intentar.",
            REQUEST_ID_REQUIRED: "No se pudo preparar un reintento seguro. Recarga la página y vuelve a intentar.",
            TRANSFER_UNAVAILABLE: "La transferencia bancaria está temporalmente deshabilitada. Selecciona pago contra entrega."
        };
        const token = message.match(/\b[A-Z_]+\b/)?.[0];
        if (token && knownErrors[token]) return knownErrors[token];
        if (/null value in column "id" of relation "orders"/i.test(message)) {
            return "El servidor rechazó el identificador del pedido. No se borró tu carrito. Conservamos la referencia de reintento; vuelve a intentarlo más tarde y contacta a la tienda si el problema continúa.";
        }
        if (error?.code === "23505") return "Este pedido ya se había recibido. Conservamos su referencia para evitar duplicarlo; vuelve a cargar la página para revisar su estado.";
        if (error?.code === "PGRST202" || error?.code === "PGRST203") return "La conexión del checkout está desactualizada. Recarga la página e inténtalo nuevamente.";
        if (/fetch|network|timeout|offline/i.test(message)) return "Se perdió la conexión. Tu carrito y la referencia de reintento se conservaron; vuelve a intentar cuando tengas conexión.";
        return "No se pudo crear el pedido. Tu carrito se conservó. Inténtalo de nuevo o contacta a la tienda si persiste.";
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (transferDialog.open || preparingOrder || submitting) return;
        preparingOrder = true;
        const order = validateAndCreateOrder();
        if (!order) { preparingOrder = false; return; }
        try {
            await assignRequestId(order);
        } catch {
            feedback.textContent = "No se pudo preparar el pedido. Inténtalo nuevamente.";
            preparingOrder = false;
            return;
        }
        preparingOrder = false;

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
