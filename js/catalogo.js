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
    const validCategories = ["panela", "saborizados", "derivados", "bebidas"];
    const queryParameters = new URLSearchParams(window.location.search);
    const requestedCategory = queryParameters.get("categoria");
    let selectedCategory = validCategories.includes(requestedCategory) ? requestedCategory : "all";
    const favoriteIds = new Set();
    let favoriteUserId = null;

    searchInput.value = queryParameters.get("q") || "";

    function renderProducts() {
        const searchTerm = searchInput.value.trim().toLocaleLowerCase("es");
        const filteredProducts = window.PANELA_PRODUCTS.filter(product => {
            const matchesCategory = selectedCategory === "all" || product.categoria === selectedCategory;
            const matchesSearch = product.nombre.toLocaleLowerCase("es").includes(searchTerm);
            return matchesCategory && matchesSearch;
        });

        categoryButtons.forEach(button => {
            button.setAttribute("aria-pressed", String(button.dataset.category === selectedCategory));
        });

        results.innerHTML = filteredProducts.map(product => {
            const available = window.PanelaStore.getAvailableStock(product.id);
            const addLabel = `Agregar ${product.nombre} al carrito`;

            return `
                <article class="product-card">
                    <a href="producto.html?id=${product.id}" class="product-image-link">
                        <img src="${product.imagen}" alt="${product.alt}" class="product-image" loading="lazy" width="600" height="600">
                    </a>
                    <div class="product-info">
                        <span class="product-category">${window.PANELA_CATEGORY_NAMES[product.categoria]}</span>
                        <h3>${product.nombre}</h3>
                        <p class="product-presentation">${product.presentacion}</p>
                        <p class="product-price"><span>Precio</span><br>$${product.precio.toFixed(2)}</p>
                        ${available === 0 ? '<p class="stock-message">No puedes agregar más unidades disponibles de este producto.</p>' : ""}
                        <div class="product-actions">
                            <a href="producto.html?id=${product.id}" class="product-view-link" aria-label="Ver ${product.nombre}">Ver producto</a>
                            <button type="button" class="favorite-toggle" data-favorite-product="${product.id}" aria-label="${favoriteIds.has(product.id) ? `Quitar ${product.nombre} de favoritos` : `Añadir ${product.nombre} a favoritos`}">${favoriteIds.has(product.id) ? "Quitar de favoritos" : "Añadir a favoritos"}</button>
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
            (async () => {
                if (!window.supabaseClient) { window.PanelaUI.showToast("Los favoritos requieren configurar Supabase."); return; }
                const { data: { user } } = await window.supabaseClient.auth.getUser();
                if (!user) { window.location.assign(`login.html?return=${encodeURIComponent("productos.html")}`); return; }
                window.PanelaAuthUser = { id: user.id, email: user.email, firstName: user.user_metadata?.first_name || "" };
                favoriteButton.disabled = true;
                const result = await window.PanelaStore.setFavorite(id, !favoriteIds.has(id));
                favoriteButton.disabled = false;
                if (result.error) window.PanelaUI.showToast("No se pudo guardar el favorito.");
                else { const name = window.PanelaStore.getProduct(id).nombre; if (favoriteIds.has(id)) { favoriteIds.delete(id); favoriteButton.textContent = "Añadir a favoritos"; favoriteButton.setAttribute("aria-label", `Añadir ${name} a favoritos`); window.PanelaUI.showToast(`${name} se quitó de favoritos.`); } else { favoriteIds.add(id); favoriteButton.textContent = "Quitar de favoritos"; favoriteButton.setAttribute("aria-label", `Quitar ${name} de favoritos`); window.PanelaUI.showToast(`${name} se añadió a favoritos.`); } }
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
        if (window.supabaseClient) {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (user) {
                favoriteUserId = user.id;
                window.PanelaAuthUser = { id: user.id, email: user.email, firstName: user.user_metadata?.first_name || "" };
                const { data } = await window.PanelaStore.getFavorites();
                data?.forEach(row => favoriteIds.add(Number(row.product_id)));
            }
        }
        renderProducts();
    })();
    window.addEventListener("panela:sessionchange", () => {
        const userId = window.PanelaStore.getCurrentUser()?.id || null;
        if (favoriteUserId !== null && userId !== favoriteUserId) window.location.reload();
    });
})();
