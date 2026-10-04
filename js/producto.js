(() => {
    const detail = document.getElementById("product-detail");

    if (!detail) {
        return;
    }

    const productId = new URLSearchParams(window.location.search).get("id");
    const product = window.PanelaStore.getProduct(productId);
    const notFound = document.getElementById("product-not-found");

    if (!product) {
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
    document.getElementById("detail-category").textContent = window.PANELA_CATEGORY_NAMES[product.categoria];
    document.getElementById("detail-name").textContent = product.nombre;
    document.getElementById("detail-price").textContent = `$${product.precio.toFixed(2)}`;
    document.getElementById("detail-presentation").textContent = product.presentacion;
    document.getElementById("detail-description").textContent = product.descripcion;
    quantityInput.setAttribute("aria-label", `Cantidad de ${product.nombre}`);
    detail.hidden = false;

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
