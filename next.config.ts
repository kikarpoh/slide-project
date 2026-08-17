import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. 💡 告诉 Next.js 不要用 Webpack 打包该服务端 SDK，由 Node.js 原生 require 加载
  // serverExternalPackages: ["cloudmersive-convert-api-client"],

  // // 2. 允许 Webpack 将无前缀的模块尝试按相对路径解析
  // webpack: (config) => {
  //   config.resolve = config.resolve || {};
  //   config.resolve.preferRelative = true;
  //   return config;
  // },
};

export default nextConfig;