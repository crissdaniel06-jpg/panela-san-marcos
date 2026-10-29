(async () => {
    const detail = document.getElementById("product-detail");

    if (!detail) {
        return;
    }

    const productsLoad = await window.PanelaProductsReady;

    const productId = new URLSearchParams(window.location.search).get("id");
    const product = window.PanelaStore.getProduct(productId);
    const notFound = document.getElementById("product-not-found");

    if (!product) {
        if (!productsLoad.ok) document.querySelector("#product-not-found p").textContent = "No pudimos verificar el catálogo. Comprueba tu conexión e inténtalo de nuevo.";
        notFound.hidden = false;
        return;
    }

    const quantityInput = document.getElementById("detail-quantity");
    const addButton = document.getElementById("detail-add-button");
    const availability = document.getElementById("detail-availability");

    document.title = `${product.nombre} | Panela San Marcos`;
    document.getElementById("breadcrumb-product").textContent = product.nombre;
    document.getElementById("detail-image").src = product.imagen;
    document.getElementById("detail-image").alt = product.alt;
    document.getElementById("detail-image").width = 800;
    document.getElementById("detail-image").height = 640;
    document.getElementById("detail-image").decoding = "async";
    document.getElementById("detail-category").textContent = window.PANELA_CATEGORY_NAMES[product.categoria];
    document.getElementById("detail-name").textContent = product.nombre;
    document.getElementById("detail-price").textContent = `$${product.precio.toFixed(2)}`;
    document.getElementById("detail-presentation").textContent = product.presentacion;
    document.getElementById("detail-description").textContent = product.descripcion;
    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "favorite-toggle";
    favoriteButton.textContent = "☆";
    favoriteButton.setAttribute("aria-pressed", "false");
    favoriteButton.setAttribute("aria-label", `Añadir ${product.nombre} a favoritos`);
    favoriteButton.addEventListener("click", async () => {
        if (favoriteButton.disabled) return;
        favoriteButton.disabled = true;
        if (!window.supabaseClient) { favoriteButton.disabled = false; window.PanelaUI.showToast("No se pudo conectar con tus favoritos."); return; }
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (!user) { favoriteButton.disabled = false; window.location.assign(`login.html?return=${encodeURIComponent(`producto.html?id=${product.id}`)}`); return; }
        window.PanelaAuthUser = { id: user.id, email: user.email, firstName: user.user_metadata?.first_name || "" };
        const isSaved = favoriteButton.dataset.saved === "true";
        const { error } = await window.PanelaStore.setFavorite(product.id, !isSaved);
        favoriteButton.disabled = false;
        if (error) window.PanelaUI.showToast("No se pudo guardar el favorito.");
        else { favoriteButton.dataset.saved = String(!isSaved); favoriteButton.textContent = isSaved ? "☆" : "★"; favoriteButton.classList.toggle("is-active", !isSaved); favoriteButton.setAttribute("aria-pressed", String(!isSaved)); favoriteButton.setAttribute("aria-label", `${isSaved ? "Añadir" : "Quitar"} ${product.nombre} ${isSaved ? "a" : "de"} favoritos`); window.PanelaUI.showToast(`${product.nombre} se ${isSaved ? "quitó de" : "añadió a"} favoritos.`); }
    });
    if (window.supabaseClient) window.supabaseClient.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return;
        window.PanelaAuthUser = { id: user.id, email: user.email, firstName: user.user_metadata?.first_name || "" };
        const { data } = await window.PanelaStore.getFavorites();
        if (data?.some(row => Number(row.product_id) === product.id)) {
            favoriteButton.dataset.saved = "true";
            favoriteButton.textContent = "★";
            favoriteButton.classList.add("is-active");
            favoriteButton.setAttribute("aria-pressed", "true");
            favoriteButton.setAttribute("aria-label", `Quitar ${product.nombre} de favoritos`);
        }
    });
    document.querySelector(".detail-image-wrap").append(favoriteButton);
    quantityInput.setAttribute("aria-label", `Cantidad de ${product.nombre}`);
    detail.hidden = false;

    const related = window.PANELA_PRODUCTS.filter(item => item.id !== product.id && item.categoria === product.categoria).slice(0, 4);
    const relatedSection = document.getElementById("related-products");
    const relatedGrid = document.getElementById("related-products-grid");
    if (related.length && relatedSection && relatedGrid) {
        relatedGrid.replaceChildren(...related.map(item => {
            const card = document.createElement("article");
            card.className = "product-card";
            const link = document.createElement("a");
            link.className = "product-image-link";
            link.href = `producto.html?id=${item.id}`;
            link.setAttribute("aria-label", `Ver ${item.nombre}`);
            const image = document.createElement("img");
            image.className = "product-image";
            image.src = item.imagen;
            image.alt = item.alt;
            image.loading = "lazy";
            image.width = 600;
            image.height = 600;
            link.append(image);
            const info = document.createElement("div");
            info.className = "product-info";
            const name = document.createElement("h3");
            const nameLink = document.createElement("a");
            nameLink.href = `producto.html?id=${item.id}`;
            nameLink.textContent = item.nombre;
            name.append(nameLink);
            const price = document.createElement("p");
            price.className = "product-price";
            const priceLabel = document.createElement("span");
            priceLabel.className = "product-price-label";
            priceLabel.textContent = "Precio";
            const priceAmount = document.createElement("strong");
            priceAmount.textContent = `$${item.precio.toFixed(2)}`;
            price.append(priceLabel, priceAmount);
            info.append(name, price);
            card.append(link, info);
            return card;
        }));
        relatedSection.hidden = false;
    }

    function updateAvailableQuantity() {
        const available = window.PanelaStore.getAvailableStock(product.id);
        quantityInput.max = String(available);
        quantityInput.disabled = available === 0;
        addButton.disabled = available === 0;
        document.querySelector("[data-quantity-up]").disabled = available === 0;
        document.querySelector("[data-quantity-down]").disabled = available === 0;

        if (available === 0) {
            quantityInput.value = "1";
            availability.textContent = "No puedes agregar más unidades disponibles de este producto.";
        } else {
            if (Number(quantityInput.value) > available) {
                quantityInput.value = String(available);
            }
            availability.textContent = `Disponible: ${available} ${available === 1 ? "unidad" : "unidades"}.`;
        }
    }

    document.querySelector("[data-quantity-down]").addEventListener("click", () => {
        quantityInput.value = String(Math.max(1, Number(quantityInput.value || 1) - 1));
    });

    document.querySelector("[data-quantity-up]").addEventListener("click", () => {
        const available = window.PanelaStore.getAvailableStock(product.id);
        quantityInput.value = String(Math.min(available, Number(quantityInput.value || 1) + 1));
    });

    function normalizeQuantity() {
        if (quantityInput.value === "") {
            return;
        }

        const available = window.PanelaStore.getAvailableStock(product.id);
        const quantity = Number(quantityInput.value);
        quantityInput.value = String(Math.max(1, Math.min(available || 1, Number.isFinite(quantity) ? Math.floor(quantity) : 1)));
    }

    quantityInput.addEventListener("input", normalizeQuantity);
    quantityInput.addEventListener("change", normalizeQuantity);

    document.getElementById("detail-add-form").addEventListener("submit", event => {
        event.preventDefault();
        const result = window.PanelaStore.add(product.id, Number(quantityInput.value));

        if (result.ok) {
            window.PanelaUI.showToast(`✓ ${product.nombre} se agregó al carrito.`);
            updateAvailableQuantity();
        } else if (result.reason === "stock") {
            window.PanelaUI.showToast("No puedes agregar más unidades disponibles de este producto.");
        } else {
            window.PanelaUI.showToast("No se pudo guardar el producto. Inténtalo de nuevo.");
        }
    });

    window.addEventListener("storage", updateAvailableQuantity);
    updateAvailableQuantity();
})();
