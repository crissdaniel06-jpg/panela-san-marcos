(() => {
    const itemsContainer = document.getElementById("cart-items");

    if (!itemsContainer) {
        return;
    }

    const emptyState = document.getElementById("cart-empty");
    const cartContent = document.getElementById("cart-content");
    const money = amount => `$${amount.toFixed(2)}`;

    function renderCart() {
        const cart = window.PanelaStore.getCart();
        emptyState.hidden = cart.length > 0;
        cartContent.hidden = cart.length === 0;

        if (cart.length === 0) {
            itemsContainer.innerHTML = "";
            return;
        }

        itemsContainer.innerHTML = cart.map(item => {
            const product = window.PanelaStore.getProduct(item.id);

            return `
                <article class="cart-item" data-cart-row="${product.id}">
                    <a href="producto.html?id=${product.id}" class="cart-item-image">
                        <img src="${product.imagen}" alt="${product.alt}">
                    </a>
                    <div class="cart-item-info">
                        <h3><a href="producto.html?id=${product.id}">${product.nombre}</a></h3>
                        <p class="product-presentation">${product.presentacion}</p>
                        <p class="cart-unit-price">Precio unitario: ${money(product.precio)}</p>
                        <div class="cart-item-actions">
                            <div class="quantity-control cart-quantity">
                                <button type="button" data-cart-action="decrease" aria-label="Disminuir cantidad de ${product.nombre}" ${item.quantity <= 1 ? "disabled" : ""}>−</button>
                                <output aria-label="Cantidad de ${product.nombre}">${item.quantity}</output>
                                <button type="button" data-cart-action="increase" aria-label="Aumentar cantidad de ${product.nombre}" ${item.quantity >= product.stock ? "disabled" : ""}>+</button>
                            </div>
                            <button type="button" class="remove-item-button" data-cart-action="remove" aria-label="Eliminar ${product.nombre}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                    <path d="M6.5 1h3a.5.5 0 0 1 .5.5V2h3a.5.5 0 0 1 0 1h-.538l-.853 10.233A2 2 0 0 1 9.616 15H6.384a2 2 0 0 1-1.993-1.767L3.538 3H3a.5.5 0 0 1 0-1h3v-.5a.5.5 0 0 1 .5-.5M4.542 3l.845 10.15a1 1 0 0 0 .997.85h3.232a1 1 0 0 0 .997-.85L11.458 3zM6.5 5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5m3 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5" />
                                </svg>
                                Eliminar
                            </button>
                        </div>
                        ${item.quantity >= product.stock ? '<p class="stock-message" role="status" aria-live="polite">No puedes agregar más unidades disponibles de este producto.</p>' : ""}
                    </div>
                    <p class="cart-line-subtotal"><span>Subtotal</span><strong>${money(product.precio * item.quantity)}</strong></p>
                </article>
            `;
        }).join("");

        const subtotal = window.PanelaStore.getSubtotal();
        document.getElementById("cart-subtotal").textContent = money(subtotal);
        document.getElementById("cart-total").textContent = money(subtotal);
    }

    itemsContainer.addEventListener("click", event => {
        const button = event.target.closest("[data-cart-action]");

        if (!button) {
            return;
        }

        const row = button.closest("[data-cart-row]");
        const id = Number(row.dataset.cartRow);
        const item = window.PanelaStore.getCart().find(cartItem => cartItem.id === id);
        const product = window.PanelaStore.getProduct(id);
        const action = button.dataset.cartAction;

        if (action === "remove") {
            window.PanelaStore.remove(id);
            window.PanelaUI.showToast(`✓ ${product.nombre} se eliminó del carrito.`);
        } else {
            const nextQuantity = item.quantity + (action === "increase" ? 1 : -1);
            const result = window.PanelaStore.setQuantity(id, nextQuantity);

            if (!result.ok) {
                window.PanelaUI.showToast("No puedes agregar más unidades disponibles de este producto.");
                return;
            }

            window.PanelaUI.showToast(`Cantidad de ${product.nombre}: ${nextQuantity}.`);
        }

        renderCart();

        if (action === "remove") {
            (itemsContainer.querySelector(".remove-item-button") || emptyState.querySelector("a"))?.focus();
        } else {
            const updatedRow = itemsContainer.querySelector(`[data-cart-row="${id}"]`);
            const updatedControl = updatedRow?.querySelector(`[data-cart-action="${action}"]:not(:disabled)`) ||
                updatedRow?.querySelector('[data-cart-action="increase"]:not(:disabled), [data-cart-action="decrease"]:not(:disabled)') ||
                updatedRow?.querySelector('[data-cart-action="remove"]');
            updatedControl?.focus();
        }
    });

    window.addEventListener("storage", renderCart);
    renderCart();
})();
