(() => {
  const form = document.getElementById("recovery-form");
  if (!form) return;
  const password = document.getElementById("recovery-password");
  const confirmation = document.getElementById("recovery-confirm");
  const feedback = document.getElementById("recovery-feedback");
  const submit = document.getElementById("recovery-submit");
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo") === "1";
  let recoveryReady = demo;

  if (demo) document.getElementById("recovery-demo").hidden = false;
  if (params.has("error")) {
    feedback.textContent = "El enlace no es válido o ya venció. Solicita uno nuevo desde iniciar sesión.";
    submit.disabled = true;
  }

  if (!demo && window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange(event => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryReady = true;
        feedback.textContent = "Enlace verificado. Ya puedes guardar tu contraseña nueva.";
        password.focus();
      }
    });
  } else if (!demo) {
    feedback.textContent = "No se pudo conectar con el servicio de cuentas. Inténtalo más tarde.";
    submit.disabled = true;
  }

  [password, confirmation].forEach(input => input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    document.getElementById(`${input.id}-error`).textContent = "";
  }));

  form.addEventListener("submit", async event => {
    event.preventDefault();
    feedback.textContent = "";
    let firstInvalid = null;
    if (password.value.length < 8) {
      document.getElementById("recovery-password-error").textContent = "Usa al menos 8 caracteres.";
      password.setAttribute("aria-invalid", "true"); firstInvalid = password;
    }
    if (confirmation.value !== password.value) {
      document.getElementById("recovery-confirm-error").textContent = "Las contraseñas no coinciden.";
      confirmation.setAttribute("aria-invalid", "true"); firstInvalid ||= confirmation;
    }
    if (firstInvalid) { firstInvalid.focus(); return; }
    if (!recoveryReady) {
      feedback.textContent = "Abre el enlace de recuperación enviado a tu correo para continuar.";
      return;
    }
    if (demo) {
      feedback.textContent = "Prueba completada: los campos se validaron. No se guardó ninguna contraseña.";
      return;
    }
    submit.disabled = true;
    const { error } = await window.supabaseClient.auth.updateUser({ password: password.value });
    submit.disabled = false;
    if (error) {
      feedback.textContent = "No se pudo actualizar la contraseña. El enlace puede haber vencido; solicita uno nuevo.";
      return;
    }
    feedback.textContent = "Contraseña actualizada. Ya puedes iniciar sesión.";
    password.value = ""; confirmation.value = "";
    await window.supabaseClient.auth.signOut();
    window.setTimeout(() => window.location.assign("login.html?password_updated=1"), 1400);
  });
})();
