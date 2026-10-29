(() => {
  const form = document.getElementById("profile-form");
  if (!form) return;
  const state = document.getElementById("account-state");
  const passwordForm = document.getElementById("password-form");
  let loadedUserId = null;
  (async () => {
    if (!window.supabaseClient) { state.textContent = "La cuenta requiere configuración de Supabase."; return; }
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    if (!user) {
      state.innerHTML = 'Inicia sesión para consultar tu perfil. <a href="login.html?return=cuenta.html">Iniciar sesión</a>';
      const ordersState = document.getElementById("orders-state");
      if (ordersState) ordersState.textContent = "Inicia sesión para consultar tus pedidos.";
      return;
    }
    window.PanelaAuthUser = { id: user.id, email: user.email, firstName: "", lastName: "" };
    loadedUserId = user.id;
    const profile = await window.PanelaStore.loadProfile();
    if (!profile) {
      state.textContent = "No se pudo cargar el perfil. Comprueba tu conexión e inténtalo de nuevo.";
      const ordersState = document.getElementById("orders-state");
      if (ordersState) ordersState.textContent = "No se pudieron cargar tus pedidos.";
      return;
    }
    window.PanelaAuthUser.firstName = profile.first_name || "";
    window.PanelaAuthUser.lastName = profile.last_name || "";
    form.hidden = false; passwordForm.hidden = false;
    if (new URLSearchParams(window.location.search).get("recovery") === "1") {
      passwordForm.querySelector("h2").textContent = "Restablecer contraseña";
      state.textContent = "Ingresa tu nueva contraseña para finalizar la recuperación de cuenta.";
    }
    document.getElementById("profile-first").value = profile.first_name || "";
    document.getElementById("profile-last").value = profile.last_name || "";
    document.getElementById("profile-phone").value = profile.phone || "";
    document.getElementById("profile-address").value = profile.address || "";
    document.getElementById("profile-city").value = profile.city || "";
    document.getElementById("profile-email").value = user.email || "";
    await renderOrderHistory();
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const phone = document.getElementById("profile-phone").value.trim();
      if (phone && phone.replace(/\D/g, "").length < 7) { state.textContent = "Ingresa un teléfono válido de al menos 7 dígitos."; document.getElementById("profile-phone").focus(); return; }
      state.textContent = "Guardando tus datos…";
      let result;
      try {
        result = await window.PanelaStore.saveProfile({ firstName: document.getElementById("profile-first").value.trim(), lastName: document.getElementById("profile-last").value.trim(), phone, address: document.getElementById("profile-address").value.trim(), city: document.getElementById("profile-city").value.trim() });
      } catch {
        state.textContent = "No se pudo guardar el perfil por un problema de conexión. Inténtalo de nuevo.";
        return;
      }
      if (result.error) { state.textContent = "No se pudo guardar el perfil. Revisa tus datos e inténtalo nuevamente."; return; }
      window.PanelaAuthUser.firstName = document.getElementById("profile-first").value.trim();
      window.PanelaAuthUser.lastName = document.getElementById("profile-last").value.trim();
      window.dispatchEvent(new Event("panela:sessionchange"));
      const email = document.getElementById("profile-email").value.trim();
      if (email !== user.email) {
        const { error } = await window.supabaseClient.auth.updateUser({ email });
        if (error) { state.textContent = "Perfil guardado, pero no se pudo solicitar el cambio de correo. " + error.message; return; }
        state.textContent = "Perfil guardado. Confirma el cambio de correo desde el mensaje enviado por Supabase.";
      } else state.textContent = "Perfil actualizado correctamente.";
    });
    passwordForm.addEventListener("submit", async event => {
      event.preventDefault(); state.textContent = "Actualizando contraseña…";
      const { error } = await window.supabaseClient.auth.updateUser({ password: document.getElementById("new-password").value });
      state.textContent = error ? "No se pudo actualizar la contraseña. " + error.message : "Contraseña actualizada correctamente.";
      if (!error) passwordForm.reset();
    });
  })();

  async function renderOrderHistory() {
    const ordersState = document.getElementById("orders-state");
    const list = document.getElementById("account-orders-list");
    if (!ordersState || !list) return;
    const { data, error } = await window.PanelaStore.getOrders();
    if (error) {
      ordersState.textContent = "No pudimos cargar tus pedidos. Comprueba tu conexión e inténtalo de nuevo.";
      return;
    }
    const orders = data || [];
    if (!orders.length) {
      ordersState.textContent = "Aún no tienes pedidos. Cuando realices una compra, aparecerá aquí.";
      return;
    }
    const paymentLabels = {
      PENDIENTE: "Pendiente",
      COMPROBANTE_RECIBIDO: "Comprobante recibido",
      PENDIENTE_VERIFICACION: "Pendiente de revisión",
      VERIFICADO: "Pago verificado",
      RECHAZADO: "Pago rechazado",
      REQUIERE_CORRECCION: "Comprobante por corregir"
    };
    const orderLabels = { PENDIENTE: "Pendiente", CANCELADO: "Cancelado", COMPLETADO: "Completado" };
    const money = value => `$${Number(value || 0).toFixed(2)}`;
    list.replaceChildren(...orders.map(order => {
      const card = document.createElement("article");
      card.className = "account-order-card";
      const heading = document.createElement("h3");
      heading.textContent = `Pedido ${order.id}`;
      const date = document.createElement("p");
      const orderDate = new Date(order.created_at);
      date.textContent = Number.isNaN(orderDate.getTime()) ? "Fecha no disponible" : orderDate.toLocaleDateString("es-EC", { dateStyle: "medium" });
      const status = document.createElement("p");
      status.textContent = `Estado: ${orderLabels[order.status] || "En proceso"}`;
      const payment = document.createElement("p");
      payment.textContent = `Pago: ${paymentLabels[order.payment_status] || "Pendiente"}`;
      const items = document.createElement("ul");
      (order.order_items || []).forEach(item => {
        const line = document.createElement("li");
        line.textContent = `${item.product_name} × ${item.quantity} · ${money(item.line_subtotal)}`;
        items.append(line);
      });
      const total = document.createElement("p");
      total.className = "account-order-total";
      total.textContent = `Total: ${money(order.total)}`;
      card.append(heading, date, status, payment, items, total);
      return card;
    }));
    ordersState.textContent = `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}.`;
  }

  window.addEventListener("panela:sessionchange", () => {
    const userId = window.PanelaStore.getCurrentUser()?.id || null;
    if (loadedUserId !== null && userId !== loadedUserId) window.location.reload();
  });
})();
