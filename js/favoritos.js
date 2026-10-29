(() => {
  const grid = document.getElementById("favorites-grid");
  if (!grid) return;
  const status = document.getElementById("favorites-status");
  const empty = document.getElementById("favorites-empty");
  let loadedUserId = null;

  (async () => {
    status.textContent = "Cargando tus favoritos…";
    await window.PanelaAuthReady;
    if (!window.supabaseClient) { status.textContent = "No se pudo conectar con la cuenta."; return; }
    const productsLoad = await window.PanelaProductsReady;
    if (!productsLoad.ok) { status.textContent = "No pudimos consultar los precios y la disponibilidad actuales. Inténtalo de nuevo cuando haya conexión."; return; }
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    if (!user) {
      status.innerHTML = 'Inicia sesión para ver tus favoritos. <a href="login.html?return=favoritos.html">Iniciar sesión</a>';
      return;
    }
    loadedUserId = user.id;
    window.PanelaAuthUser = { ...window.PanelaStore.getCurrentUser(), id: user.id, email: user.email };
    const { data, error } = await window.PanelaStore.getFavorites();
    if (error) { status.textContent = "No se pudieron cargar tus favoritos. Inténtalo de nuevo."; return; }
    const products = (data || []).map(row => window.PanelaStore.getProduct(row.product_id)).filter(Boolean);
    if (!products.length) {
      status.textContent = "";
      empty.hidden = false;
      return;
    }
    status.textContent = `${products.length} ${products.length === 1 ? "producto guardado" : "productos guardados"}.`;
    grid.replaceChildren(...products.map(product => {
      const card = document.createElement("article"); card.className = "product-card";
      const link = document.createElement("a"); link.className = "product-image-link"; link.href = `producto.html?id=${product.id}`; link.setAttribute("aria-label", `Ver ${product.nombre}`);
      const img = document.createElement("img"); img.src = product.imagen; img.alt = product.alt; img.className = "product-image"; img.loading = "lazy"; img.width = 600; img.height = 600; link.append(img);
      const info = document.createElement("div"); info.className = "product-info";
      const category = document.createElement("span"); category.className = "product-category"; category.textContent = window.PANELA_CATEGORY_NAMES[product.categoria];
      const title = document.createElement("h3"); title.textContent = product.nombre;
      const presentation = document.createElement("p"); presentation.className = "product-presentation"; presentation.textContent = product.presentacion;
      const price = document.createElement("p"); price.className = "product-price"; price.textContent = `$${product.precio.toFixed(2)}`;
      const actions = document.createElement("div"); actions.className = "product-actions";
      const view = document.createElement("a"); view.className = "product-view-link"; view.href = `producto.html?id=${product.id}`; view.textContent = "Ver producto";
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "favorite-toggle is-active"; remove.setAttribute("aria-pressed", "true"); remove.setAttribute("aria-label", `Quitar ${product.nombre} de favoritos`); remove.textContent = "★";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        const result = await window.PanelaStore.setFavorite(product.id, false);
        if (result.error) { remove.disabled = false; status.textContent = "No se pudo quitar el favorito. Inténtalo de nuevo."; }
        else {
          card.remove();
          status.textContent = `${product.nombre} se quitó de favoritos.`;
          if (!grid.children.length) { status.textContent = ""; empty.hidden = false; }
        }
      });
      actions.append(view, remove); info.append(category, title, presentation, price, actions); card.append(link, info); return card;
    }));
  })();

  window.addEventListener("panela:sessionchange", () => {
    const userId = window.PanelaStore.getCurrentUser()?.id || null;
    if (loadedUserId !== null && userId !== loadedUserId) window.location.reload();
  });
})();
