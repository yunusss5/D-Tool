/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The muxing route spawns ffmpeg from node_modules. Next's tracer only follows
  // `import`/`require`, so a binary resolved by path has to be named explicitly
  // or it never reaches the deployed function.
  experimental: {
    outputFileTracingIncludes: {
      '/api/download': ['./node_modules/ffmpeg-static/ffmpeg*'],
      '/api/fetch': ['./node_modules/ffmpeg-static/ffmpeg*'],
    },
  },
  images: {
    domains: [
      'i.ytimg.com',
      'scontent.cdninstagram.com',
      'i.pinimg.com',
      'img.youtube.com',
      'pbs.twimg.com',
      'p16-sign-va.tiktokcdn.com',
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: '**.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: '**.pinimg.com',
      },
      {
        protocol: 'https',
        hostname: '**.twimg.com',
      },
      {
        protocol: 'https',
        hostname: '**.tiktokcdn.com',
      },
      {
        protocol: 'https',
        hostname: '**.tiktokcdn-us.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Range' },
          {
            key: 'Access-Control-Expose-Headers',
            value: 'Content-Length, Content-Disposition, Content-Range, X-Media-Bytes, X-Media-Size',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
