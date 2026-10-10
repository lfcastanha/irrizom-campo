/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gera um site estático: o app inteiro roda no celular e fala direto com o Supabase.
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
