const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

// The manifest is written against the local dev server. Production builds
// rewrite every https://localhost:3000/ URL to where the add-in is hosted:
//   ADDIN_PUBLIC_URL=https://your-host.example.com/ npm run build
const urlDev = "https://localhost:3000/";
const urlProd = process.env.ADDIN_PUBLIC_URL ? withSlash(process.env.ADDIN_PUBLIC_URL) : null;

function withSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function withHostUrl(content, dev) {
  return dev ? content : content.toString().replace(new RegExp(urlDev, "g"), urlProd);
}

async function getHttpsOptions() {
  // Loaded lazily so production builds never touch the dev certificates.
  const devCerts = require("office-addin-dev-certs");
  const options = await devCerts.getHttpsServerOptions();
  return { ca: options.ca, key: options.key, cert: options.cert };
}

module.exports = async (env, options) => {
  const dev = options.mode === "development";
  if (!dev && !urlProd) {
    throw new Error("Set ADDIN_PUBLIC_URL to the HTTPS address the add-in is hosted at, e.g. https://code-highlighter.example.com/");
  }
  if (!dev && !urlProd.startsWith("https://")) throw new Error("ADDIN_PUBLIC_URL must start with https://");
  return {
    devtool: dev ? "source-map" : false,
    entry: {
      taskpane: "./src/taskpane/taskpane.ts",
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".js"],
    },
    module: {
      rules: [{ test: /\.ts$/, exclude: /node_modules/, use: "ts-loader" }],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["taskpane"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          // The store screenshot is for Partner Center, not the hosted site.
          { from: "assets/*.png", to: "assets/[name][ext]", globOptions: { ignore: ["**/store-*"] } },
          { from: "src/taskpane/taskpane.css", to: "taskpane.css" },
          { from: "src/pages/*.html", to: "[name][ext]" },
          {
            from: "manifest*.xml",
            to: "[name][ext]",
            transform: (content) => withHostUrl(content, dev),
          },
          // One-command installers, served next to the manifest they download.
          { from: "install/*", to: "[name][ext]", transform: (content) => withHostUrl(content, dev) },
        ],
      }),
    ],
    devServer: {
      headers: { "Access-Control-Allow-Origin": "*" },
      server: env.WEBPACK_SERVE ? { type: "https", options: await getHttpsOptions() } : undefined,
      port: Number(process.env.npm_package_config_dev_server_port) || 3000,
    },
  };
};
