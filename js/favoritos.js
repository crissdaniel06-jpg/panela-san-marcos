(() => {
  const grid = document.getElementById("favorites-grid");
  if (!grid) return;
  const status = document.getElementById("favorites-status");
  let loadedUserId = null;
  (async () => {
    if (!window.supabaseClient) { status.textContent = "Los favoritos requieren configuración de Supabase."; return; }
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    if (!user) { status.innerHTML = 'Inicia sesión para ver tus favoritos. <a href="login.html?return=favoritos.html">Iniciar sesión</a>'; return; }
    window.PanelaAuthUser = { id: user.id, email: user.email, firstName: user.user_metadata?.first_name || "" };
    loadedUserId = user.id;
    const { data, error } = await window.PanelaStore.getFavorites();
    if (error) { status.textContent = "No se pudieron cargar tus favoritos."; return; }
    const products = data.map(row => window.PanelaStore.getProduct(row.product_id)).filter(Boolean);
    if (!products.length) { status.textContent = "Todavía no tienes productos favoritos."; return; }
    status.textContent = `${products.length} productos guardados.`;
    for (const product of products) {
      const card = document.createElement("article"); card.className = "product-card";
      const link = document.createElement("a"); link.className = "product-image-link"; link.href = `producto.html?id=${product.id}`; link.setAttribute("aria-label", `Ver ${product.nombre}`);
      const img = document.createElement("img"); img.src = product.imagen; img.alt = product.alt; img.className = "product-image"; img.loading = "lazy"; link.append(img);
      const info = document.createElement("div"); info.className = "product-info";
      const title = document.createElement("h2"); title.textContent = product.nombre;
      const price = document.createElement("p"); price.className = "product-price"; price.textContent = `$${product.precio.toFixed(2)}`;
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "secondary-action"; remove.textContent = `Quitar ${product.nombre} de favoritos`;
      remove.addEventListener("click", async () => { remove.disabled = true; const result = await window.PanelaStore.setFavorite(product.id, false); if (result.error) { remove.disabled = false; status.textContent = "No se pudo quitar el favorito."; } else { card.remove(); status.textContent = `Se quitó ${product.nombre} de favoritos.`; } });
      info.append(title, price, remove); card.append(link, info); grid.append(card);
    }
  })();
  window.addEventListener("panela:sessionchange", () => {
    const userId = window.PanelaStore.getCurrentUser()?.id || null;
    if (loadedUserId !== null && userId !== loadedUserId) window.location.reload();
  });
})();
