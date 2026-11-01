const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${process.env.API_PORT ?? 4001}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
