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
                        <img src="${product.imagen}" alt="${product.alt}" class="product-image">
                    </a>
                    <div class="product-info">
                        <span class="product-category">${window.PANELA_CATEGORY_NAMES[product.categoria]}</span>
                        <h3>${product.nombre}</h3>
                        <p class="product-presentation">${product.presentacion}</p>
                        <p class="product-price"><span>Precio</span><br>$${product.precio.toFixed(2)}</p>
                        ${available === 0 ? '<p class="stock-message">No puedes agregar más unidades disponibles de este producto.</p>' : ""}
                        <div class="product-actions">
                            <a href="producto.html?id=${product.id}" class="product-view-link">Ver producto</a>
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

    renderProducts();
})();
