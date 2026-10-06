(() => {
    const cartStorageKey = "panelaSanMarcosCart";
    const orderStorageKey = "panelaSanMarcosLastOrder";
    const usersStorageKey = "panelaSanMarcosUsers";
    const sessionStorageKey = "panelaSanMarcosCurrentUser";
    const shippingRates = Object.freeze({
        Pacto: 1.50,
        Quito: 2.50,
        Cumbayá: 3.00,
        Tumbaco: 3.00
    });
    const demoUser = {
        id: "demo-customer",
        firstName: "Cliente",
        lastName: "Demostración",
        email: "cliente@panelasanmarcos.com",
        password: "123456"
    };

    function readUsers() {
        try {
            const users = JSON.parse(localStorage.getItem(usersStorageKey) || "[]");
            return Array.isArray(users) ? users : [];
        } catch {
            return [];
        }
    }

    function saveUsers(users) {
        try {
            localStorage.setItem(usersStorageKey, JSON.stringify(users));
            return true;
        } catch {
            return false;
        }
    }

    function ensureDemoUser() {
        const users = readUsers();
        const demoExists = users.some(user => user.email.toLowerCase() === demoUser.email);

        if (!demoExists) {
            users.push(demoUser);
            saveUsers(users);
        }
    }

    function publicUser(user) {
        return {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email
        };
    }

    function getCurrentUser() {
        try {
            const session = JSON.parse(localStorage.getItem(sessionStorageKey) || "null");

            if (!session) {
                return null;
            }

            const user = readUsers().find(candidate => candidate.id === session.id && candidate.email === session.email);

            if (!user) {
                localStorage.removeItem(sessionStorageKey);
                return null;
            }

            return publicUser(user);
        } catch {
            return null;
        }
    }

    function notifySessionChange() {
        window.dispatchEvent(new Event("panela:sessionchange"));
    }

    function registerUser({ firstName, lastName, email, password }) {
        const normalizedEmail = email.trim().toLowerCase();
        const users = readUsers();

        if (users.some(user => user.email.toLowerCase() === normalizedEmail)) {
            return { ok: false, reason: "duplicate" };
        }

        const user = {
            id: `customer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: normalizedEmail,
            password
        };

        if (!saveUsers([...users, user])) {
            return { ok: false, reason: "storage" };
        }

        return { ok: true, user: publicUser(user) };
    }

    function login(email, password) {
        const normalizedEmail = email.trim().toLowerCase();
        const user = readUsers().find(candidate => candidate.email.toLowerCase() === normalizedEmail && candidate.password === password);

        if (!user) {
            return { ok: false, reason: "invalid" };
        }

        try {
            localStorage.setItem(sessionStorageKey, JSON.stringify({ id: user.id, email: user.email }));
        } catch {
            return { ok: false, reason: "storage" };
        }

        notifySessionChange();
        return { ok: true, user: publicUser(user) };
    }

    function logout() {
        localStorage.removeItem(sessionStorageKey);
        notifySessionChange();
    }

    function getProduct(id) {
        return window.PANELA_PRODUCTS.find(product => product.id === Number(id));
    }

    function readCart() {
        try {
            const savedCart = JSON.parse(localStorage.getItem(cartStorageKey) || "[]");

            if (!Array.isArray(savedCart)) {
                return [];
            }

            const quantities = new Map();

            savedCart.forEach(item => {
                const product = getProduct(item.id);
                const quantity = Number(item.quantity);

                if (product && Number.isInteger(quantity) && quantity > 0) {
                    quantities.set(product.id, (quantities.get(product.id) || 0) + quantity);
                }
            });

            return [...quantities.entries()]
                .map(([id, quantity]) => ({
                    id,
                    quantity: Math.min(quantity, getProduct(id).stock)
                }))
                .filter(item => item.quantity > 0);
        } catch {
            return [];
        }
    }

    function saveCart(cart) {
        const normalizedCart = cart
            .map(item => {
                const product = getProduct(item.id);
                const quantity = Math.floor(Number(item.quantity));

                if (!product || !Number.isFinite(quantity) || quantity < 1) {
                    return null;
                }

                return {
                    id: product.id,
                    quantity: Math.min(quantity, product.stock)
                };
            })
            .filter(Boolean);

        try {
            localStorage.setItem(cartStorageKey, JSON.stringify(normalizedCart));
        } catch {
            return false;
        }

        updateCartCount();
        return true;
    }

    function getCart() {
        return readCart();
    }

    function getQuantity(id) {
        return readCart().find(item => item.id === Number(id))?.quantity || 0;
    }

    function getAvailableStock(id) {
        const product = getProduct(id);
        return product ? Math.max(0, product.stock - getQuantity(product.id)) : 0;
    }

    function add(id, amount = 1) {
        const product = getProduct(id);
        const quantityToAdd = Number(amount);

        if (!product) {
            return { ok: false, reason: "missing" };
        }

        if (!Number.isInteger(quantityToAdd) || quantityToAdd < 1) {
            return { ok: false, reason: "quantity" };
        }

        const cart = readCart();
        const currentItem = cart.find(item => item.id === product.id);
        const nextQuantity = (currentItem?.quantity || 0) + quantityToAdd;

        if (nextQuantity > product.stock) {
            return { ok: false, reason: "stock" };
        }

        if (currentItem) {
            currentItem.quantity = nextQuantity;
        } else {
            cart.push({ id: product.id, quantity: quantityToAdd });
        }

        if (!saveCart(cart)) {
            return { ok: false, reason: "storage" };
        }

        return { ok: true, product };
    }

    function setQuantity(id, quantity) {
        const product = getProduct(id);
        const nextQuantity = Number(quantity);

        if (!product) {
            return { ok: false, reason: "missing" };
        }

        if (!Number.isInteger(nextQuantity) || nextQuantity < 1) {
            return { ok: false, reason: "quantity" };
        }

        if (nextQuantity > product.stock) {
            return { ok: false, reason: "stock" };
        }

        const cart = readCart();
        const item = cart.find(cartItem => cartItem.id === product.id);

        if (!item) {
            return { ok: false, reason: "missing" };
        }

        item.quantity = nextQuantity;
        return saveCart(cart) ? { ok: true } : { ok: false, reason: "storage" };
    }

    function remove(id) {
        return saveCart(readCart().filter(item => item.id !== Number(id)));
    }

    function clearCart() {
        return saveCart([]);
    }

    function getSubtotal() {
        return readCart().reduce((subtotal, item) => {
            return subtotal + getProduct(item.id).precio * item.quantity;
        }, 0);
    }

    function getCount() {
        return readCart().reduce((total, item) => total + item.quantity, 0);
    }

    function updateCartCount() {
        const count = getCount();

        document.querySelectorAll(".cart-count").forEach(element => {
            element.textContent = `(${count})`;
            element.setAttribute("aria-label", `${count} ${count === 1 ? "unidad" : "unidades"} en el carrito`);
        });
    }

    function saveOrder(order) {
        try {
            localStorage.setItem(orderStorageKey, JSON.stringify({
                ...order,
                status: order.status || "PENDIENTE",
                paymentStatus: order.paymentStatus || "PENDIENTE"
            }));
            return true;
        } catch {
            return false;
        }
    }

    function getLastOrder() {
        try {
            const order = JSON.parse(localStorage.getItem(orderStorageKey) || "null");

            if (!order) {
                return null;
            }

            // Keep orders saved by earlier prototype versions readable.
            if (order.status === "Pedido recibido") order.status = "PENDIENTE";
            if (order.status === "Pedido cancelado") order.status = "CANCELADO";
            order.paymentStatus ||= "PENDIENTE";
            return order;
        } catch {
            return null;
        }
    }

    function setLastOrderStatus(status) {
        if (status !== "CANCELADO") {
            return false;
        }

        const order = getLastOrder();

        if (!order) {
            return false;
        }

        if (order.status !== "PENDIENTE") {
            return false;
        }

        order.status = "CANCELADO";
        return saveOrder(order);
    }

    function getShippingCost(city) {
        return Object.hasOwn(shippingRates, city) ? shippingRates[city] : null;
    }

    ensureDemoUser();

    window.PanelaStore = {
        getProduct,
        getCart,
        getQuantity,
        getAvailableStock,
        add,
        setQuantity,
        remove,
        clearCart,
        getSubtotal,
        getCount,
        updateCartCount,
        saveOrder,
        getLastOrder,
        setLastOrderStatus,
        registerUser,
        login,
        logout,
        getCurrentUser,
        getShippingCost,
        shippingRates
    };

    window.addEventListener("storage", updateCartCount);
    window.addEventListener("storage", notifySessionChange);
})();
