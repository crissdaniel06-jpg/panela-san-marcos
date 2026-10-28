/* La URL y la clave publishable son públicas y se usan desde el navegador.
   Nunca colocar service_role aquí. */
(() => {
    const config = window.PANELA_SUPABASE_CONFIG || {
        url: "https://nrvqfuzragjsxuvqljpb.supabase.co",
        anonKey: "sb_publishable_O7ZivzxevD5TGZbtWafoAg_n4kQZ5pE"
    };
    if (config.url && config.anonKey && window.supabase?.createClient) {
        window.supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    } else {
        window.supabaseClient = null;
    }
})();
