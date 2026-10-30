(() => {
    const cartStorageKey = "panelaSanMarcosCart";
    const orderStorageKey = "panelaSanMarcosLastOrder";
    const profileCacheKey = "panelaSanMarcosProfile";
    // Retira credenciales de versiones anteriores que se guardaban en texto local.
    try {
        localStorage.removeItem("panelaSanMarcosUsers");
        localStorage.removeItem("panelaSanMarcosCurrentUser");
    } catch { /* El navegador puede bloquear el almacenamiento local. */ }
    const shippingRates = Object.freeze({
        Pacto: 1.50,
        Quito: 2.50,
        Cumbayá: 3.00,
        Tumbaco: 3.00
    });
    function getCurrentUser() {
        return window.PanelaAuthUser || null;
    }

    function notifySessionChange() {
        window.dispatchEvent(new Event("panela:sessionchange"));
    }

    function authUnavailable() { return { data: null, error: new Error("Supabase no está configurado. Revisa js/supabase-config.js.") }; }
    async function registerUser({ firstName, lastName, email, password, returnTo = "index.html" }) {
        const client = window.supabaseClient;
        if (!client) return authUnavailable();
        const confirmationUrl = new URL("login.html", window.location.href);
        confirmationUrl.searchParams.set("registered", "1");
        if (typeof returnTo === "string" && /^(index|productos|carrito|checkout|cuenta|favoritos)\.html$/.test(returnTo)) {
            confirmationUrl.searchParams.set("return", returnTo);
        } else if (typeof returnTo === "string" && /^producto\.html\?id=\d+(?:&favorite=1)?$/.test(returnTo)) {
            confirmationUrl.searchParams.set("return", returnTo);
        } else if (typeof returnTo === "string" && /^productos\.html\?favorite=\d+$/.test(returnTo)) {
            confirmationUrl.searchParams.set("return", returnTo);
        }
        return client.auth.signUp({
            email: email.trim(),
            password,
            options: {
                data: { first_name: firstName.trim(), last_name: lastName.trim() },
                emailRedirectTo: confirmationUrl.toString()
            }
        });
    }
    async function login(email, password) {
        if (!window.supabaseClient) return authUnavailable();
        return window.supabaseClient.auth.signInWithPassword({ email: email.trim(), password });
    }
    async function logout() {
        if (!window.supabaseClient) return authUnavailable();
        const result = await window.supabaseClient.auth.signOut();
        if (result.error) return result;
        window.PanelaAuthUser = null;
        localStorage.removeItem(profileCacheKey);
        localStorage.removeItem(orderStorageKey);
        notifySessionChange();
        return result;
    }
    async function loadProfile() {
        const user = getCurrentUser();
        if (!user || !window.supabaseClient) return null;
        const { data, error } = await window.supabaseClient.from("profiles").select("first_name,last_name,phone,address,city").eq("id", user.id).maybeSingle();
        if (!error && data) return { ...data, email: user.email };
        return null;
    }
    async function saveProfile(profile) {
        const user = getCurrentUser();
        if (!user || !window.supabaseClient) return authUnavailable();
        return window.supabaseClient.from("profiles").upsert({ id: user.id, first_name: profile.firstName, last_name: profile.lastName, phone: profile.phone, address: profile.address, city: profile.city, updated_at: new Date().toISOString() });
    }
    async function getFavorites() {
        const user = getCurrentUser();
        if (!user || !window.supabaseClient) return { data: null, error: new Error("Inicia sesión para consultar favoritos.") };
        return window.supabaseClient.from("favorites").select("product_id").eq("user_id", user.id);
    }

    async function getOrders() {
        const user = getCurrentUser();
        if (!user || !window.supabaseClient) return { data: null, error: new Error("Inicia sesión para consultar tus pedidos.") };
        return window.supabaseClient.from("orders")
            .select("id,status,subtotal,shipping,total,payment_method,payment_status,customer_first_name,customer_last_name,customer_email,customer_phone,delivery_address,delivery_city,created_at,order_items(product_id,product_name,quantity,unit_price,line_subtotal)")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(25);
    }

    async function getOrderById(orderId) {
        const user = getCurrentUser();
        if (!user || !window.supabaseClient) return { data: null, error: new Error("Inicia sesión para consultar este pedido.") };
        return window.supabaseClient.from("orders")
            .select("id,status,subtotal,shipping,total,payment_method,payment_status,customer_first_name,customer_last_name,customer_email,customer_phone,delivery_address,delivery_city,created_at,order_items(product_id,product_name,product_type,presentation,unit_price,quantity,line_subtotal)")
            .eq("id", orderId)
            .eq("user_id", user.id)
            .maybeSingle();
    }
    async function setFavorite(productId, favorite) {
        const user = getCurrentUser();
        if (!user || !window.supabaseClient) return authUnavailable();
        const query = window.supabaseClient.from("favorites");
        return favorite ? query.upsert({ user_id: user.id, product_id: Number(productId) }, { onConflict: "user_id,product_id" }) : query.delete().eq("user_id", user.id).eq("product_id", Number(productId));
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
                    quantity: Math.min(quantity, 100)
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
                    quantity
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
        const owner = getCurrentUser();
        if (!owner) return false;
        try {
            localStorage.setItem(orderStorageKey, JSON.stringify({ reference: order.reference, userId: owner.id }));
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
            if (!order.userId || order.userId !== getCurrentUser()?.id) {
                localStorage.removeItem(orderStorageKey);
                return null;
            }

            const reference = order.reference || order.id;
            if (typeof reference !== "string" || !reference) return null;
            // Replace legacy cached order details with an owner-scoped ID only.
            const minimalOrder = { reference, userId: order.userId };
            localStorage.setItem(orderStorageKey, JSON.stringify(minimalOrder));
            return minimalOrder;
        } catch {
            return null;
        }
    }

    async function setLastOrderStatus(status) {
        if (status !== "CANCELADO") {
            return false;
        }

        const order = getLastOrder();

        if (!order) {
            return false;
        }

        if (!window.supabaseClient || !getCurrentUser()) return false;
        const { data, error } = await window.supabaseClient.rpc("cancel_order", { p_order_id: order.reference });
        if (error || !data) return false;
        return true;
    }

    function getShippingCost(city) {
        return Object.hasOwn(shippingRates, city) ? shippingRates[city] : null;
    }

    if (window.supabaseClient) {
        let knownUserId = null;
        const updateAuthUser = session => {
            const nextUser = session?.user ? {
                id: session.user.id,
                email: session.user.email,
                firstName: session.user.user_metadata?.first_name || "",
                lastName: session.user.user_metadata?.last_name || ""
            } : null;
            if (knownUserId !== null && knownUserId !== nextUser?.id) localStorage.removeItem(orderStorageKey);
            if (!nextUser) localStorage.removeItem(orderStorageKey);
            knownUserId = nextUser?.id || null;
            window.PanelaAuthUser = nextUser;
            notifySessionChange();
            return nextUser;
        };
        window.PanelaAuthReady = window.supabaseClient.auth.getSession().then(({ data }) => updateAuthUser(data.session));
        window.supabaseClient.auth.onAuthStateChange((_event, session) => {
            if (!session) localStorage.removeItem(profileCacheKey);
            updateAuthUser(session);
        });
    } else window.PanelaAuthReady = Promise.resolve(null);

    window.PanelaProductsReady = window.supabaseClient
        ? window.supabaseClient.from("products")
            .select("id,name,description,price,category,presentation,image_path,stock,available")
            .eq("available", true)
            .order("id")
            .then(({ data, error }) => {
                if (error) throw error;
                const knownProducts = new Map((window.PANELA_PRODUCTS || []).map(product => [Number(product.id), product]));
                window.PANELA_PRODUCTS = (data || []).map(row => {
                    const known = knownProducts.get(Number(row.id));
                    const image = typeof row.image_path === "string" && /^img\/[\w./-]+$/.test(row.image_path) && !row.image_path.includes("..")
                        ? row.image_path
                        : known?.imagen || "";
                    return {
                        id: Number(row.id),
                        nombre: String(row.name || ""),
                        categoria: String(row.category || ""),
                        precio: Number(row.price),
                        presentacion: String(row.presentation || ""),
                        stock: Math.max(0, Number(row.stock) || 0),
                        descripcion: String(row.description || ""),
                        imagen: image,
                        alt: known?.alt || String(row.name || "Producto")
                    };
                }).filter(product => Number.isInteger(product.id) && product.nombre && Number.isFinite(product.precio) && product.imagen);
                window.dispatchEvent(new Event("panela:productschange"));
                return { ok: true };
            })
            .catch(error => {
                window.PANELA_PRODUCTS = [];
                window.PanelaProductsError = error;
                window.dispatchEvent(new Event("panela:productschange"));
                return { ok: false, error };
            })
        : Promise.resolve().then(() => {
            window.PANELA_PRODUCTS = [];
            window.PanelaProductsError = new Error("No hay conexión a Supabase.");
            window.dispatchEvent(new Event("panela:productschange"));
            return { ok: false, error: window.PanelaProductsError };
        });

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
        getOrderById,
        setLastOrderStatus,
        registerUser,
        login,
        logout,
        loadProfile,
        saveProfile,
        getFavorites,
        getOrders,
        setFavorite,
        getCurrentUser,
        getShippingCost,
        shippingRates
    };

    window.addEventListener("storage", updateCartCount);
    window.addEventListener("storage", notifySessionChange);
})();
