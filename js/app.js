(() => {
	const toast = document.createElement("div");
	let toastTimer;
	let toastHideTimer;

	toast.className = "app-toast";
	toast.setAttribute("role", "status");
	toast.setAttribute("aria-live", "polite");
	toast.setAttribute("aria-atomic", "true");
	toast.hidden = true;
	document.body.append(toast);

	window.PanelaUI = {
		showToast(message) {
			window.clearTimeout(toastTimer);
			window.clearTimeout(toastHideTimer);
			toast.textContent = message;
			toast.hidden = false;
			toast.classList.add("is-visible");
			toastTimer = window.setTimeout(() => {
				toast.classList.remove("is-visible");
				toastHideTimer = window.setTimeout(() => {
					toast.hidden = true;
				}, 180);
			}, 4500);
		}
	};

	const searchButton = document.querySelector("[data-search-toggle]");
	const searchPanel = document.getElementById("header-search-panel");
	const searchForm = document.getElementById("header-search-form");
	const headerActions = document.querySelector(".header-actions");
	const cartLink = headerActions?.querySelector(".cart-button");
	let userToggle;
	let userPanel;
	let guestLink;

	if (headerActions && cartLink) {
		const userWidget = document.createElement("div");
		userWidget.className = "auth-widget";
		userWidget.innerHTML = `
			<a href="login.html" class="auth-link" data-auth-guest>Iniciar sesión</a>
			<button type="button" class="auth-user-toggle" data-auth-toggle aria-expanded="false" aria-controls="header-user-panel" hidden>
				Hola, <span data-auth-name></span>
			</button>
			<section class="auth-user-panel" id="header-user-panel" aria-label="Mi cuenta" hidden>
				<h2>Mi cuenta</h2>
				<p data-auth-email></p>
				<button type="button" class="auth-logout-button" data-auth-logout>Cerrar sesión</button>
			</section>
		`;
		cartLink.before(userWidget);
		guestLink = userWidget.querySelector("[data-auth-guest]");
		userToggle = userWidget.querySelector("[data-auth-toggle]");
		userPanel = userWidget.querySelector("#header-user-panel");

		function closeUserPanel(returnFocus = false) {
			userPanel.hidden = true;
			userToggle.setAttribute("aria-expanded", "false");

			if (returnFocus) {
				userToggle.focus();
			}
		}

		function positionUserPanel() {
			if (userPanel.hidden) {
				return;
			}

			const toggleBounds = userToggle.getBoundingClientRect();
			const panelWidth = Math.min(280, window.innerWidth - 28);
			const left = Math.max(14, Math.min(toggleBounds.right - panelWidth, window.innerWidth - panelWidth - 14));
			userPanel.style.position = "fixed";
			userPanel.style.left = `${left}px`;
			userPanel.style.right = "auto";
			userPanel.style.top = `${toggleBounds.bottom + 8}px`;
		}

		function updateUserHeader() {
			const user = window.PanelaStore?.getCurrentUser();
			guestLink.hidden = Boolean(user);
			userToggle.hidden = !user;

			if (user) {
				userWidget.querySelector("[data-auth-name]").textContent = user.firstName;
				userWidget.querySelector("[data-auth-email]").textContent = user.email;
			} else {
				closeUserPanel();
			}
		}

		userToggle.addEventListener("click", () => {
			const shouldOpen = userPanel.hidden;
			userPanel.hidden = !shouldOpen;
			userToggle.setAttribute("aria-expanded", String(shouldOpen));
			positionUserPanel();
		});

		userPanel.querySelector("[data-auth-logout]").addEventListener("click", () => {
			window.PanelaStore.logout();
			window.PanelaUI.showToast("Has cerrado sesión.");
		});

		userWidget.addEventListener("keydown", event => {
			if (event.key === "Escape" && !userPanel.hidden) {
				event.preventDefault();
				closeUserPanel(true);
			}
		});

		document.addEventListener("pointerdown", event => {
			if (!userPanel.hidden && !userWidget.contains(event.target)) {
				closeUserPanel();
			}
		});

		window.addEventListener("panela:sessionchange", updateUserHeader);
		window.addEventListener("storage", updateUserHeader);
		window.addEventListener("resize", positionUserPanel);
	}

	if (searchButton && searchPanel && searchForm) {
		const searchInput = document.getElementById("header-product-search");
		const results = document.getElementById("header-search-results");
		const status = document.getElementById("header-search-status");
		const allResults = document.getElementById("header-search-all");
		const closeButton = document.getElementById("header-search-close");

		function closeSearch(returnFocus = false) {
			searchPanel.hidden = true;
			searchButton.setAttribute("aria-expanded", "false");

			if (returnFocus) {
				searchButton.focus();
			}
		}

		function renderSearchResults() {
			const query = searchInput.value.trim();
			const normalizedQuery = query.toLocaleLowerCase("es");
			const matches = normalizedQuery
				? (window.PANELA_PRODUCTS || []).filter(product => product.nombre.toLocaleLowerCase("es").includes(normalizedQuery))
				: [];

			results.replaceChildren(...matches.map(product => {
				const item = document.createElement("li");
				const link = document.createElement("a");
				const category = document.createElement("span");

				link.href = `producto.html?id=${product.id}`;
				link.textContent = product.nombre;
				category.textContent = window.PANELA_CATEGORY_NAMES[product.categoria];
				item.append(link, category);
				return item;
			}));

			status.textContent = !query
				? "Escribe el nombre de un producto."
				: matches.length
					? `${matches.length} ${matches.length === 1 ? "producto encontrado" : "productos encontrados"}.`
					: "No encontramos productos con ese nombre.";
			allResults.hidden = !query;
			allResults.href = `productos.html?q=${encodeURIComponent(query)}`;
		}

		function openSearch() {
			searchPanel.hidden = false;
			searchButton.setAttribute("aria-expanded", "true");
			renderSearchResults();
			searchInput.focus();
		}

		searchButton.addEventListener("click", () => {
			if (searchPanel.hidden) {
				openSearch();
			} else {
				closeSearch(true);
			}
		});

		closeButton.addEventListener("click", () => closeSearch(true));
		searchInput.addEventListener("input", renderSearchResults);

		searchPanel.addEventListener("keydown", event => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeSearch(true);
			}
		});

		searchInput.addEventListener("keydown", event => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeSearch(true);
			} else if (event.key === "ArrowDown") {
				const firstResult = results.querySelector("a");

				if (firstResult) {
					event.preventDefault();
					firstResult.focus();
				}
			}
		});

		results.addEventListener("keydown", event => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeSearch(true);
			} else if (event.key === "ArrowUp" && event.target === results.querySelector("a")) {
				event.preventDefault();
				searchInput.focus();
			}
		});

		searchForm.addEventListener("submit", event => {
			event.preventDefault();

			if (searchInput.value.trim()) {
				window.location.assign(allResults.href);
			}
		});

		document.addEventListener("pointerdown", event => {
			if (!searchPanel.hidden && !searchPanel.contains(event.target) && !searchButton.contains(event.target)) {
				closeSearch();
			}
		});
	}

	document.addEventListener("DOMContentLoaded", () => {
		window.PanelaStore?.updateCartCount();
		if (guestLink) {
			const user = window.PanelaStore?.getCurrentUser();
			guestLink.hidden = Boolean(user);
			userToggle.hidden = !user;
			if (user) {
				document.querySelector("[data-auth-name]").textContent = user.firstName;
				document.querySelector("[data-auth-email]").textContent = user.email;
			}
		}
	});
})();