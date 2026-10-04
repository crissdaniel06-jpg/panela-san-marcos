(() => {
    const content = document.getElementById("confirmation-content");

    if (!content) {
        return;
    }

    const order = window.PanelaStore.getLastOrder();
    const emptyState = document.getElementById("confirmation-empty");

    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
        emptyState.hidden = false;
        return;
    }

    const money = amount => `$${Number(amount).toFixed(2)}`;
    const customerName = `${order.customer.firstName} ${order.customer.lastName}`.trim();
    const orderDate = new Date(order.createdAt);

    content.hidden = false;
    document.getElementById("order-reference").textContent = order.reference;
    document.getElementById("confirmation-customer").textContent = customerName;
    document.getElementById("confirmation-phone").textContent = order.customer.phone;
    document.getElementById("confirmation-email").textContent = order.customer.email;
    document.getElementById("confirmation-destination").textContent = order.destination || order.customer.city || "No especificado";
    document.getElementById("confirmation-address").textContent = order.customer.address;
    document.getElementById("confirmation-payment").textContent = order.paymentMethod;
    document.getElementById("confirmation-date").textContent = Number.isNaN(orderDate.getTime())
        ? "Fecha no disponible"
        : orderDate.toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" });

    const orderStatus = document.getElementById("order-status");
    const cancelButton = document.getElementById("cancel-order-button");
    const cancelDialog = document.getElementById("cancel-order-dialog");
    const backButton = document.getElementById("cancel-order-back");
    const confirmCancelButton = document.getElementById("confirm-cancel-order");
    const orderIsCancelled = order.status === "Pedido cancelado";

    orderStatus.textContent = orderIsCancelled ? "Pedido cancelado" : "Pedido recibido";
    cancelButton.hidden = orderIsCancelled;
    if (orderIsCancelled) {
        document.getElementById("confirmation-tag").textContent = "PEDIDO CANCELADO";
        document.getElementById("confirmation-title").textContent = "Pedido cancelado";
        document.getElementById("confirmation-lead").textContent = "Este pedido fue cancelado.";
    }
    document.getElementById("cancel-order-number").textContent = order.reference;
    document.getElementById("cancel-order-total").textContent = money(order.total);

    cancelButton.addEventListener("click", () => {
        cancelDialog.showModal();
        backButton.focus();
    });

    backButton.addEventListener("click", () => cancelDialog.close());

    cancelDialog.addEventListener("close", () => {
        if (window.PanelaStore.getLastOrder()?.status === "Pedido cancelado") {
            orderStatus.focus();
        } else {
            cancelButton.focus();
        }
    });

    cancelDialog.addEventListener("cancel", event => {
        event.preventDefault();
        cancelDialog.close();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && cancelDialog.open) {
            event.preventDefault();
            cancelDialog.close();
        }
    }, true);

    confirmCancelButton.addEventListener("click", () => {
        if (!window.PanelaStore.setLastOrderStatus("Pedido cancelado")) {
            window.PanelaUI.showToast("No se pudo actualizar el pedido. Inténtalo de nuevo.");
            return;
        }

        orderStatus.textContent = "Pedido cancelado";
        document.getElementById("confirmation-tag").textContent = "PEDIDO CANCELADO";
        document.getElementById("confirmation-title").textContent = "Pedido cancelado";
        document.getElementById("confirmation-lead").textContent = "Este pedido fue cancelado.";
        cancelButton.hidden = true;
        cancelDialog.close();
        window.PanelaUI.showToast(`Tu pedido #${order.reference} ha sido cancelado correctamente.`);
    });

    const itemList = document.getElementById("confirmation-items");

    order.items.forEach(item => {
        const listItem = document.createElement("li");
        const description = document.createElement("span");
        const subtotal = document.createElement("strong");

        description.textContent = `${item.name} · ${item.presentation} × ${item.quantity}`;
        subtotal.textContent = money(item.subtotal);
        listItem.append(description, subtotal);
        itemList.append(listItem);
    });

    document.getElementById("confirmation-subtotal").textContent = money(order.subtotal);
    document.getElementById("confirmation-shipping").textContent = money(order.shipping);
    document.getElementById("confirmation-total").textContent = money(order.total);
})();
