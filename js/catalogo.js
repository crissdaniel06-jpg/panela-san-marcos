(() => {
    const results = document.getElementById("catalog-results");

    if (!results) {
        return;
    }

    const categoryButtons = [...document.querySelectorAll("[data-category]")];
    const searchInput = document.getElementById("buscador");
    const emptyState = document.getElementById("catalog-empty");
    const clearSearchButton = document.getElementById("clear-search");
    const resultCount = document.getElementById("catalog-count");
    const connectionStatus = document.getElementById("catalog-connection-status");
    const validCategories = ["panela", "saborizados", "derivados", "bebidas"];
    const queryParameters = new URLSearchParams(window.location.search);
    const requestedCategory = queryParameters.get("categoria");
    let selectedCategory = validCategories.includes(requestedCategory) ? requestedCategory : "all";
    const favoriteIds = new Set();
    let favoriteUserId = null;

    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);

    searchInput.value = queryParameters.get("q") || "";

    function renderProducts() {
        const searchTerm = searchInput.value.trim().toLocaleLowerCase("es");
        const filteredProducts = window.PANELA_PRODUCTS.filter(product => {
            const matchesCategory = selectedCategory === "all" || product.categoria === selectedCategory;
            const searchable = `${product.nombre} ${product.descripcion} ${product.presentacion} ${window.PANELA_CATEGORY_NAMES[product.categoria] || ""}`.toLocaleLowerCase("es");
            const matchesSearch = searchable.includes(searchTerm);
            return matchesCategory && matchesSearch;
        });
        categoryButtons.forEach(button => {
            button.setAttribute("aria-pressed", String(button.dataset.category === selectedCategory));
        });

        results.innerHTML = filteredProducts.map(product => {
            const available = window.PanelaStore.getAvailableStock(product.id);
            const name = escapeHtml(product.nombre);
            const alt = escapeHtml(product.alt);
            const image = escapeHtml(product.imagen);
            const category = escapeHtml(window.PANELA_CATEGORY_NAMES[product.categoria] || "Producto");
            const presentation = escapeHtml(product.presentacion);
            const addLabel = `Agregar ${name} al carrito`;

            return `
                <article class="product-card">
                    <div class="product-image-frame">
                        <img src="${image}" alt="${alt}" class="product-image" loading="lazy" width="600" height="600">
                    </div>
                    <div class="product-info">
                        <span class="product-category">${category}</span>
                        <h3>${name}</h3>
                        <p class="product-presentation">${presentation}</p>
                        <p class="product-price"><span class="product-price-label">Precio</span><strong>$${product.precio.toFixed(2)}</strong></p>
                        ${available === 0 ? '<p class="stock-message">No puedes agregar más unidades disponibles de este producto.</p>' : ""}
                        <div class="product-actions">
                            <a href="producto.html?id=${product.id}" class="product-view-link" aria-label="Ver producto: ${name}">Ver producto</a>
                            <button type="button" class="favorite-toggle${favoriteIds.has(product.id) ? " is-active" : ""}" data-favorite-product="${product.id}" aria-pressed="${favoriteIds.has(product.id)}" aria-label="${favoriteIds.has(product.id) ? `Quitar ${name} de favoritos` : `Añadir ${name} a favoritos`}">${favoriteIds.has(product.id) ? "★" : "☆"}</button>
                            <button type="button" class="add-to-cart-button" data-add-product="${product.id}" aria-label="${addLabel}" ${available === 0 ? "disabled" : ""}>
                                Agregar al carrito
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        results.hidden = filteredProducts.length === 0;
        emptyState.hidden = filteredProducts.length !== 0;
        clearSearchButton.hidden = searchInput.value.length === 0 && selectedCategory === "all";
        resultCount.textContent = filteredProducts.length === 1
            ? "1 producto encontrado."
            : `${filteredProducts.length} productos encontrados.`;
    }

    categoryButtons.forEach(button => {
        button.addEventListener("click", () => {
            selectedCategory = button.dataset.category;
            renderProducts();
        });
    });

    searchInput.addEventListener("input", renderProducts);

    clearSearchButton.addEventListener("click", () => {
        selectedCategory = "all";
        searchInput.value = "";
        renderProducts();
        categoryButtons[0].focus();
    });

    results.addEventListener("click", event => {
        const favoriteButton = event.target.closest("[data-favorite-product]");
        if (favoriteButton) {
            const id = Number(favoriteButton.dataset.favoriteProduct);
            favoriteButton.disabled = true;
            (async () => {
                if (!window.supabaseClient) { favoriteButton.disabled = false; window.PanelaUI.showToast("No se pudo conectar con tus favoritos."); return; }
                const { data: { user } } = await window.supabaseClient.auth.getUser();
                if (!user) { window.location.assign(`login.html?return=${encodeURIComponent(`productos.html?favorite=${id}`)}`); return; }
                window.PanelaAuthUser = { id: user.id, email: user.email, firstName: user.user_metadata?.first_name || "" };
                const result = await window.PanelaStore.setFavorite(id, !favoriteIds.has(id));
                favoriteButton.disabled = false;
                if (result.error) window.PanelaUI.showToast("No se pudo guardar el favorito.");
                else { const name = window.PanelaStore.getProduct(id).nombre; const saved = !favoriteIds.has(id); if (!saved) favoriteIds.delete(id); else favoriteIds.add(id); favoriteButton.textContent = saved ? "★" : "☆"; favoriteButton.classList.toggle("is-active", saved); favoriteButton.setAttribute("aria-pressed", String(saved)); favoriteButton.setAttribute("aria-label", `${saved ? "Quitar" : "Añadir"} ${name} ${saved ? "de" : "a"} favoritos`); window.PanelaUI.showToast(`${name} se ${saved ? "añadió a" : "quitó de"} favoritos.`); }
            })();
            return;
        }
        const addButton = event.target.closest("[data-add-product]");

        if (!addButton) {
            return;
        }

        const product = window.PanelaStore.getProduct(addButton.dataset.addProduct);
        const result = window.PanelaStore.add(product.id);

        if (result.ok) {
            window.PanelaUI.showToast(`✓ ${product.nombre} se agregó al carrito.`);
            renderProducts();
            results.querySelector(`[data-add-product="${product.id}"]`)?.focus();
        } else if (result.reason === "stock") {
            window.PanelaUI.showToast("No puedes agregar más unidades disponibles de este producto.");
        } else {
            window.PanelaUI.showToast("No se pudo guardar el producto. Inténtalo de nuevo.");
        }
    });

    (async () => {
        const productsLoad = await window.PanelaProductsReady;
        if (!productsLoad.ok) {
            connectionStatus.textContent = "No pudimos verificar precios y disponibilidad. Comprueba tu conexión e inténtalo de nuevo.";
            emptyState.querySelector("p").textContent = "El catálogo no está disponible mientras verificamos los datos actuales.";
            renderProducts();
            return;
        }
        await window.PanelaAuthReady;
        if (window.supabaseClient) {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (user) {
                favoriteUserId = user.id;
                window.PanelaAuthUser = { id: user.id, email: user.email, firstName: user.user_metadata?.first_name || "" };
                const { data } = await window.PanelaStore.getFavorites();
                data?.forEach(row => favoriteIds.add(Number(row.product_id)));
                const pendingFavorite = Number(queryParameters.get("favorite"));
                if (pendingFavorite && window.PANELA_PRODUCTS.some(product => product.id === pendingFavorite) && !favoriteIds.has(pendingFavorite)) {
                    const { error } = await window.PanelaStore.setFavorite(pendingFavorite, true);
                    if (!error) { favoriteIds.add(pendingFavorite); window.PanelaUI.showToast(`${window.PanelaStore.getProduct(pendingFavorite).nombre} se añadió a favoritos.`); }
                }
            }
        }
        renderProducts();
    })();
    window.addEventListener("panela:productschange", renderProducts);
    window.addEventListener("panela:sessionchange", () => {
        const userId = window.PanelaStore.getCurrentUser()?.id || null;
        if (favoriteUserId !== null && userId !== favoriteUserId) window.location.reload();
    });
})();
