(() => {
  const form = document.getElementById("profile-form");
  if (!form) return;
  const state = document.getElementById("account-state");
  const passwordForm = document.getElementById("password-form");
  let loadedUserId = null;
  (async () => {
    if (!window.supabaseClient) { state.textContent = "La cuenta requiere configuración de Supabase."; return; }
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    if (!user) { state.innerHTML = 'Inicia sesión para consultar tu perfil. <a href="login.html?return=cuenta.html">Iniciar sesión</a>'; return; }
    window.PanelaAuthUser = { id: user.id, email: user.email, firstName: user.user_metadata?.first_name || "" };
    loadedUserId = user.id;
    const profile = await window.PanelaStore.loadProfile();
    if (!profile) { state.textContent = "No se pudo cargar el perfil. Inténtalo de nuevo."; return; }
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
    form.addEventListener("submit", async event => {
      event.preventDefault(); state.textContent = "Guardando…";
      const result = await window.PanelaStore.saveProfile({ firstName: document.getElementById("profile-first").value.trim(), lastName: document.getElementById("profile-last").value.trim(), phone: document.getElementById("profile-phone").value.trim(), address: document.getElementById("profile-address").value.trim(), city: document.getElementById("profile-city").value.trim() });
      if (result.error) { state.textContent = "No se pudo guardar el perfil. " + result.error.message; return; }
      window.PanelaAuthUser.firstName = document.getElementById("profile-first").value.trim();
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
  window.addEventListener("panela:sessionchange", () => {
    const userId = window.PanelaStore.getCurrentUser()?.id || null;
    if (loadedUserId !== null && userId !== loadedUserId) window.location.reload();
  });
})();
