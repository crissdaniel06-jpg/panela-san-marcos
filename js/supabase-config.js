/* Configuración pública. Reemplaza los valores con URL y anon/publishable key.
   Nunca colocar service_role aquí. La app funciona como catálogo sin configuración. */
(() => {
    const config = window.PANELA_SUPABASE_CONFIG || {
        url: "",
        anonKey: ""
    };
    if (config.url && config.anonKey && window.supabase?.createClient) {
        window.supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    } else {
        window.supabaseClient = null;
    }
})();
