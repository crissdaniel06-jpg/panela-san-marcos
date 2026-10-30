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
    bindPasswordForm(passwordForm);
  })();

  function bindPasswordForm(form) {
    const password = document.getElementById("new-password");
    const confirmation = document.getElementById("confirm-new-password");
    const submit = document.getElementById("password-submit");
    const feedback = document.getElementById("password-feedback");
    const mismatch = document.getElementById("confirm-password-error");
    let saving = false;
    form.querySelectorAll("[data-password-toggle]").forEach(toggle => {
      const input = document.getElementById(toggle.getAttribute("aria-controls"));
      const eye = toggle.querySelector(".bi-eye");
      const eyeSlash = toggle.querySelector(".bi-eye-slash");
      toggle.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        toggle.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
        eye.hidden = show;
        eyeSlash.hidden = !show;
      });
    });
    const validate = () => {
      const matches = !confirmation.value || password.value === confirmation.value;
      mismatch.textContent = matches ? "" : "Las contraseñas no coinciden.";
      if (matches) confirmation.removeAttribute("aria-invalid");
      else confirmation.setAttribute("aria-invalid", "true");
      submit.disabled = saving || password.value.length < 8 || confirmation.value.length < 8 || password.value !== confirmation.value;
    };
    form.addEventListener("input", () => { feedback.textContent = ""; validate(); });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      validate();
      if (submit.disabled || !form.reportValidity()) return;
      saving = true; submit.disabled = true; submit.setAttribute("aria-busy", "true");
      feedback.textContent = "Actualizando contraseña…";
      try {
        const result = await window.supabaseClient.auth.updateUser({ password: password.value });
        if (result.error) {
          feedback.textContent = "No se pudo actualizar la contraseña. Verifica los requisitos e inténtalo de nuevo.";
          feedback.setAttribute("role", "alert"); return;
        }
        form.reset(); feedback.textContent = "Contraseña actualizada correctamente."; feedback.setAttribute("role", "status");
      } catch {
        feedback.textContent = "No se pudo actualizar la contraseña. Comprueba tu conexión e inténtalo de nuevo.";
        feedback.setAttribute("role", "alert");
      } finally {
        saving = false; submit.removeAttribute("aria-busy"); validate();
      }
    });
    validate();
  }

  async function renderOrderHistory() {
    const ordersState = document.getElementById("orders-state"), list = document.getElementById("account-orders-list");
    if (!ordersState || !list) return;
    const result = await window.PanelaStore.getOrders();
    if (result.error) { ordersState.textContent = "No pudimos cargar tus pedidos. Comprueba tu conexión e inténtalo de nuevo."; return; }
    const orders = result.data || [];
    if (!orders.length) { list.replaceChildren(); ordersState.textContent = "Aún no tienes pedidos. Cuando realices una compra, aparecerá aquí."; return; }
    const paymentLabels = { PENDIENTE:"Pendiente", COMPROBANTE_RECIBIDO:"Comprobante recibido", PENDIENTE_VERIFICACION:"Pendiente de revisión", VERIFICADO:"Pago verificado", PAGADO:"Pagado", RECHAZADO:"Pago rechazado", REQUIERE_CORRECCION:"Comprobante por corregir" };
    const orderLabels = { PENDIENTE:"Pendiente", CANCELADO:"Cancelado", COMPLETADO:"Completado" };
    const money = value => "$" + Number(value || 0).toFixed(2);
    const valueOr = value => value ? String(value) : "No especificado";
    list.replaceChildren(...orders.map(order => {
      const card = document.createElement("article"); card.className = "account-order-card";
      const heading = document.createElement("h3"); heading.textContent = "Pedido " + order.id;
      const date = document.createElement("p"), parsedDate = new Date(order.created_at);
      date.textContent = Number.isNaN(parsedDate.getTime()) ? "Fecha no disponible" : parsedDate.toLocaleString("es-EC", { dateStyle:"medium", timeStyle:"short" });
      const seller = document.createElement("p"); seller.textContent = "Vendedor: Panela San Marcos · 097 950 9568 · imporparaiso@gmail.com";
      const customer = document.createElement("p"); customer.textContent = "Cliente: " + ([order.customer_first_name,order.customer_last_name].filter(Boolean).join(" ") || "No especificado") + " · " + valueOr(order.customer_email) + " · " + valueOr(order.customer_phone);
      const delivery = document.createElement("p"); delivery.textContent = "Entrega: " + valueOr(order.delivery_address) + " · " + valueOr(order.delivery_city);
      const status = document.createElement("p"); status.textContent = "Estado: " + (orderLabels[order.status] || order.status || "No disponible");
      const payment = document.createElement("p"); payment.textContent = "Pago: " + (paymentLabels[order.payment_status] || order.payment_status || "No disponible") + " · " + valueOr(order.payment_method);
      const items = document.createElement("ul");
      (order.order_items || []).forEach(item => { const li=document.createElement("li"); li.textContent=item.product_name+" × "+item.quantity+" · "+money(item.unit_price)+" c/u · subtotal "+money(item.line_subtotal); items.append(li); });
      const subtotal=document.createElement("p"); subtotal.textContent="Subtotal: "+money(order.subtotal);
      const shipping=document.createElement("p"); shipping.textContent="Envío: "+money(order.shipping);
      const total=document.createElement("p"); total.className="account-order-total"; total.textContent="Total: "+money(order.total);
      card.append(heading,date,seller,customer,delivery,status,payment,items,subtotal,shipping,total);
      if (order.status === "PENDIENTE") {
        const cancel=document.createElement("button"); cancel.type="button"; cancel.className="secondary-action account-order-cancel"; cancel.textContent="Cancelar pedido";
        const help=document.createElement("small"); help.id="cancel-help-"+order.id; help.textContent="Solo se cancelará si el pedido sigue pendiente al confirmar."; cancel.setAttribute("aria-describedby",help.id);
        const feedback=document.createElement("p"); feedback.className="account-order-feedback"; feedback.setAttribute("role","status"); feedback.setAttribute("aria-live","polite");
        cancel.addEventListener("click",async()=>{
          if(order.status!=="PENDIENTE")return;
          if(!window.confirm("¿Cancelar el pedido "+order.id+"? Se detendrá su preparación si sigue pendiente y se restaurará el inventario. Esta acción no se puede deshacer."))return;
          cancel.disabled=true; cancel.setAttribute("aria-busy","true"); feedback.textContent="Solicitando cancelación…";
          try {
            const response=await window.supabaseClient.rpc("cancel_order",{p_order_id:order.id});
            if(response.error||!response.data){ feedback.textContent="No se canceló. El pedido puede haber cambiado de estado; se actualizará la información."; await renderOrderHistory(); return; }
            order.status="CANCELADO";
            status.textContent="Estado: Cancelado";
            cancel.remove(); help.remove(); feedback.textContent="Pedido cancelado.";
            await renderOrderHistory();
          } catch { feedback.textContent="No se pudo confirmar la cancelación. Actualiza la página para consultar el estado."; cancel.disabled=false; cancel.removeAttribute("aria-busy"); }
        });
        card.append(cancel,help,feedback);
      }
      return card;
    }));
    ordersState.textContent=orders.length+" "+(orders.length===1?"pedido":"pedidos")+".";
  }

  window.addEventListener("panela:sessionchange", () => {
    const userId = window.PanelaStore.getCurrentUser()?.id || null;
    if (loadedUserId !== null && userId !== loadedUserId) window.location.reload();
  });
})();
