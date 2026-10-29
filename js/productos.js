const productos = [
    {
        id: 1,
        nombre: "Panela molida granulada",
        categoria: "panela",
        precio: 2.50,
        presentacion: "500 g",
        stock: 30,
        descripcion: "Panela natural de caña en presentación granulada, práctica para endulzar bebidas y preparar diferentes recetas.",
        imagen: "img/productos/panela-molida.png",
        alt: "Panela molida granulada San Marcos"
    },

    {
        id: 2,
        nombre: "Panela en bloque",
        categoria: "panela",
        precio: 2.75,
        presentacion: "500 g",
        stock: 25,
        descripcion: "Panela tradicional elaborada a partir de caña de azúcar, presentada en bloques para conservar su forma y sabor característico.",
        imagen: "img/productos/panela-bloque.png",
        alt: "Panela en bloque San Marcos"
    },

    {
        id: 3,
        nombre: "Panela con canela",
        categoria: "saborizados",
        precio: 3.50,
        presentacion: "500 g",
        stock: 20,
        descripcion: "Panela granulada combinada con canela, con un aroma y sabor especiado que complementa bebidas calientes y preparaciones.",
        imagen: "img/productos/panela-canela.png",
        alt: "Panela con canela San Marcos"
    },

    {
        id: 4,
        nombre: "Panela con jengibre",
        categoria: "saborizados",
        precio: 3.50,
        presentacion: "500 g",
        stock: 20,
        descripcion: "Panela combinada con jengibre, una alternativa con un sabor ligeramente picante y aromático.",
        imagen: "img/productos/panela-jengibre.png",
        alt: "Panela con jengibre San Marcos"
    },

    {
        id: 5,
        nombre: "Miel de caña",
        categoria: "derivados",
        precio: 4.50,
        presentacion: "480 g",
        stock: 18,
        descripcion: "Derivado líquido de la caña de azúcar, de textura espesa y sabor dulce, ideal para acompañar diferentes preparaciones.",
        imagen: "img/productos/miel-cana.png",
        alt: "Miel de caña San Marcos"
    },

    {
        id: 6,
        nombre: "Melaza de caña",
        categoria: "derivados",
        precio: 3.75,
        presentacion: "300 g",
        stock: 18,
        descripcion: "Derivado concentrado de la caña de azúcar, de color oscuro, textura espesa y sabor intenso.",
        imagen: "img/productos/melaza-cana.png",
        alt: "Melaza de caña San Marcos"
    },

    {
        id: 7,
        nombre: "Dulce de panela",
        categoria: "derivados",
        precio: 3.00,
        presentacion: "20 cubitos",
        stock: 25,
        descripcion: "Dulce tradicional de panela en presentación de 20 cubitos, ideal para disfrutar directamente o acompañar bebidas.",
        imagen: "img/productos/dulce-panela.png",
        alt: "Dulce de panela San Marcos"
    },

    {
        id: 8,
        nombre: "Infusión de panela",
        categoria: "bebidas",
        precio: 4.50,
        presentacion: "25 sobres",
        stock: 15,
        descripcion: "Infusión elaborada con panela y frutas, presentada en sobres individuales para preparar fácilmente una bebida caliente.",
        imagen: "img/infusion-panela.png",
        alt: "Infusión de panela San Marcos"
    }
];


const nombresCategorias = {
    panela: "Panela",
    saborizados: "Saborizados",
    derivados: "Derivados",
    bebidas: "Bebidas"
};

window.PANELA_PRODUCTS = productos;
window.PANELA_CATEGORY_NAMES = nombresCategorias;

const contenedorProductos = document.getElementById("featured-products");

function renderFeaturedProducts() {
    if (!contenedorProductos) return;
    const featured = (window.PANELA_PRODUCTS || []).slice(0, 4);
    contenedorProductos.replaceChildren(...featured.map(producto => {
        const card = document.createElement("article");
        card.className = "product-card";
        const imageLink = document.createElement("a");
        imageLink.href = `producto.html?id=${producto.id}`;
        imageLink.className = "product-image-link";
        const image = document.createElement("img");
        image.src = producto.imagen;
        image.alt = producto.alt;
        image.className = "product-image";
        image.loading = "lazy";
        image.width = 600;
        image.height = 600;
        imageLink.append(image);
        const info = document.createElement("div");
        info.className = "product-info";
        const category = document.createElement("span");
        category.className = "product-category";
        category.textContent = nombresCategorias[producto.categoria] || "Producto";
        const title = document.createElement("h3");
        title.textContent = producto.nombre;
        const presentation = document.createElement("p");
        presentation.className = "product-presentation";
        presentation.textContent = producto.presentacion;
        const price = document.createElement("p");
        price.className = "product-price";
        price.textContent = `Precio · $${producto.precio.toFixed(2)}`;
        const view = document.createElement("a");
        view.href = imageLink.href;
        view.className = "product-view-link";
        view.textContent = `Ver ${producto.nombre} →`;
        info.append(category, title, presentation, price, view);
        card.append(imageLink, info);
        return card;
    }));
}

renderFeaturedProducts();
window.addEventListener("panela:productschange", renderFeaturedProducts);
