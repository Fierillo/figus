/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Versión de la app, expuesta al cliente para mostrarla en el footer.
    NEXT_PUBLIC_APP_VERSION: require("./package.json").version,
  },
  // `ws` (usado por /api/claim para verificar tenencia en relays) se rompe si
  // webpack lo empaqueta — el masking de frames falla con "t.mask is not a
  // function" y la verificación de figus devuelve vacío (premios siempre 422).
  // Externalizarlo lo deja requerido en runtime desde node_modules, intacto.
  experimental: {
    serverComponentsExternalPackages: ["ws"],
  },
};

module.exports = nextConfig;
